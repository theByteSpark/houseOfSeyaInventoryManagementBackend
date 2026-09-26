import type { PurchaseStatus, Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { isCompanyLevel, requireWarehouseId } from '@/utils/warehouseScope';
import { addStockInTransaction, checkLowStock } from '@/modules/inventory/inventory.service';
import { createNotification } from '@/modules/notifications/notifications.service';
import type { PurchaseInput } from './purchases.validation';

const PURCHASE_INCLUDE = {
  vendor: { select: { companyName: true, contactPerson: true, email: true, phone: true, address: true } },
  warehouse: { select: { name: true } },
  items: { include: { product: { select: { name: true, sku: true } } } },
} satisfies Prisma.PurchaseInclude;

type PurchaseWithRelations = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

const TAX_RATE = 0.18;

function toDto(purchase: PurchaseWithRelations) {
  const items = purchase.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    sku: item.product.sku,
    quantity: item.quantity,
    unitCost: Number(item.unitCost),
    lineTotal: Number(item.lineTotal),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = subtotal + tax;

  return {
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    vendorId: purchase.vendorId,
    vendorName: purchase.vendor.companyName,
    warehouseId: purchase.warehouseId,
    warehouseName: purchase.warehouse.name,
    status: purchase.status,
    items,
    subtotal,
    taxRate: TAX_RATE,
    tax,
    total,
    orderedAt: purchase.orderedAt,
    receivedAt: purchase.receivedAt,
    completionDate: purchase.completionDate,
    createdAt: purchase.createdAt,
  };
}

async function nextPurchaseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.purchase.count();
  return `PO-${year}-${String(count + 1).padStart(4, '0')}`;
}

// Warehouse-scoped roles (USER/ADMIN) are always locked to their own warehouse.
// Company-level roles see everything by default, but may narrow to one
// warehouse via the optional `warehouseId` filter param.
function scopeWarehouseWhere(user: AuthenticatedUser, warehouseId?: string): Prisma.PurchaseWhereInput {
  if (!isCompanyLevel(user)) return { warehouseId: user.warehouseId ?? '__none__' };
  return warehouseId ? { warehouseId } : {};
}

export async function listPurchases(user: AuthenticatedUser, statusFilter?: PurchaseStatus | 'ALL', warehouseId?: string) {
  const where: Prisma.PurchaseWhereInput = {
    AND: [
      scopeWarehouseWhere(user, warehouseId),
      ...(!statusFilter || statusFilter === 'ALL' ? [] : [{ status: statusFilter }]),
    ],
  };
  const purchases = await prisma.purchase.findMany({
    where,
    include: PURCHASE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return purchases.map(toDto);
}
// (statusFilter/warehouseId are optional so existing callers with just `user` keep working)

export async function listPurchasesPaginated(
  user: AuthenticatedUser,
  params: PaginationParams,
  statusFilter: PurchaseStatus | 'ALL',
  warehouseId?: string,
): Promise<PaginatedResult<ReturnType<typeof toDto>>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const searchFilter: Prisma.PurchaseWhereInput = search
    ? {
        OR: [
          { purchaseNumber: { contains: search, mode: 'insensitive' } },
          { vendor: { companyName: { contains: search, mode: 'insensitive' } } },
          { items: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
        ],
      }
    : {};

  const where: Prisma.PurchaseWhereInput = {
    AND: [
      scopeWarehouseWhere(user, warehouseId),
      searchFilter,
      ...(statusFilter === 'ALL' ? [] : [{ status: statusFilter }]),
    ],
  };

  const orderBy: Prisma.PurchaseOrderByWithRelationInput =
    sortBy === 'vendor'
      ? { vendor: { companyName: sortDir } }
      : sortBy === 'purchaseNumber' || sortBy === 'status' || sortBy === 'createdAt'
        ? { [sortBy]: sortDir }
        : { createdAt: 'desc' };

  const [total, purchases] = await prisma.$transaction([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      include: PURCHASE_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: purchases.map(toDto), total, page, pageSize };
}

export async function getPurchase(user: AuthenticatedUser, id: string) {
  const purchase = await prisma.purchase.findFirst({ where: { id, ...scopeWarehouseWhere(user) }, include: PURCHASE_INCLUDE });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  return toDto(purchase);
}

export async function createPurchase(user: AuthenticatedUser, input: PurchaseInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw ApiError.notFound('Vendor not found.');

  const warehouseId = requireWarehouseId(user, input.warehouseId);

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);

    const lineTotal = Math.round(line.unitCost * line.quantity * 100) / 100;
    return {
      productId: product.id,
      quantity: line.quantity,
      unitCost: line.unitCost,
      lineTotal,
    };
  });

  const purchaseNumber = await nextPurchaseNumber();
  const status: PurchaseStatus = input.status ?? 'INWARD_TRANSIT';

  const purchase = await prisma.purchase.create({
    data: {
      purchaseNumber,
      vendorId: vendor.id,
      warehouseId,
      status,
      orderedAt: new Date(),
      completionDate: input.completionDate,
      items: { create: itemsData },
    },
    include: PURCHASE_INCLUDE,
  });

  return toDto(purchase);
}

export async function updatePurchase(user: AuthenticatedUser, id: string, input: PurchaseInput) {
  const existing = await prisma.purchase.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!existing) throw ApiError.notFound('Purchase not found.');
  if (existing.status !== 'ORDERED' && existing.status !== 'INWARD_TRANSIT') {
    throw ApiError.badRequest('Only ordered or inward transit purchases can be edited.');
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw ApiError.notFound('Vendor not found.');

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);

    const lineTotal = Math.round(line.unitCost * line.quantity * 100) / 100;
    return {
      productId: product.id,
      quantity: line.quantity,
      unitCost: line.unitCost,
      lineTotal,
    };
  });

  await prisma.$transaction(
    async (tx) => {
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.update({
        where: { id },
        data: {
          vendorId: vendor.id,
          completionDate: input.completionDate,
          items: { create: itemsData },
        },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getPurchase(user, id);
}

// Moves a purchase from ORDERED to INWARD_TRANSIT. No stock effects — stock is
// only added once the purchase reaches IN_STOCK.
export async function markPurchaseInwardTransit(user: AuthenticatedUser, id: string) {
  const purchase = await prisma.purchase.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  if (purchase.status !== 'ORDERED') {
    throw ApiError.badRequest('Only ordered purchases can be moved to inward transit.');
  }

  const updated = await prisma.purchase.update({
    where: { id },
    data: { status: 'INWARD_TRANSIT' },
    include: PURCHASE_INCLUDE,
  });

  return toDto(updated);
}

// Moves a purchase from INWARD_TRANSIT to IN_STOCK. This is the only
// transition that adds stock: every PurchaseItem's quantity is added to
// ProductStock for (productId, warehouseId), with a RESTOCK StockMovement
// recorded per item, all inside one transaction.
export async function markPurchaseInStock(user: AuthenticatedUser, id: string) {
  const purchase = await prisma.purchase.findFirst({
    where: { id, ...scopeWarehouseWhere(user) },
    include: { items: true },
  });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  if (purchase.status !== 'INWARD_TRANSIT') {
    throw ApiError.badRequest('Only purchases in inward transit can be marked as in stock.');
  }

  await prisma.$transaction(
    async (tx) => {
      for (const item of purchase.items) {
        for (const op of addStockInTransaction(tx, item.productId, purchase.warehouseId, item.quantity, `PO ${purchase.purchaseNumber}`)) {
          await op;
        }
      }

      // completionDate is overwritten to the actual completion date rather
      // than kept at the original target, so it reflects when the purchase
      // really finished.
      await tx.purchase.update({
        where: { id },
        data: { status: 'IN_STOCK', receivedAt: new Date(), completionDate: new Date() },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  for (const item of purchase.items) {
    await checkLowStock(item.productId, purchase.warehouseId);
  }
  await createNotification({
    warehouseId: purchase.warehouseId,
    type: 'PURCHASE_RECEIVED',
    title: 'Purchase received',
    message: `Purchase order ${purchase.purchaseNumber} is now in stock.`,
    metadata: { purchaseId: purchase.id, purchaseNumber: purchase.purchaseNumber },
  });

  return getPurchase(user, id);
}

export async function cancelPurchase(user: AuthenticatedUser, id: string) {
  const purchase = await prisma.purchase.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  if (purchase.status === 'IN_STOCK') {
    throw ApiError.badRequest('A purchase that is already in stock cannot be cancelled.');
  }
  if (purchase.status === 'CANCELLED') throw ApiError.badRequest('Purchase is already cancelled.');

  const updated = await prisma.purchase.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: PURCHASE_INCLUDE,
  });

  return toDto(updated);
}
