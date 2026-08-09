import type { PurchaseStatus, Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { isCompanyLevel, requireWarehouseId } from '@/utils/warehouseScope';
import { addStockInTransaction, checkLowStock } from '@/modules/inventory/inventory.service';
import { createNotification } from '@/modules/notifications/notifications.service';
import type { PurchaseInput, ReceiveInput } from './purchases.validation';

const PURCHASE_INCLUDE = {
  vendor: { select: { companyName: true, contactPerson: true, email: true, phone: true, address: true } },
  warehouse: { select: { name: true } },
  items: { include: { product: { select: { name: true, sku: true } } } },
} satisfies Prisma.PurchaseInclude;

type PurchaseWithRelations = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

function toDto(purchase: PurchaseWithRelations) {
  const items = purchase.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    sku: item.product.sku,
    quantity: item.quantity,
    receivedQuantity: item.receivedQuantity,
    unitCost: Number(item.unitCost),
    lineTotal: Number(item.lineTotal),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

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
    total: subtotal,
    orderedAt: purchase.orderedAt,
    receivedAt: purchase.receivedAt,
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

export async function listPurchases(user: AuthenticatedUser) {
  const purchases = await prisma.purchase.findMany({
    where: scopeWarehouseWhere(user),
    include: PURCHASE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return purchases.map(toDto);
}

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
      receivedQuantity: 0,
      unitCost: line.unitCost,
      lineTotal,
    };
  });

  const purchaseNumber = await nextPurchaseNumber();

  const purchase = await prisma.purchase.create({
    data: {
      purchaseNumber,
      vendorId: vendor.id,
      warehouseId,
      status: 'DRAFT',
      items: { create: itemsData },
    },
    include: PURCHASE_INCLUDE,
  });

  return toDto(purchase);
}

export async function updatePurchase(user: AuthenticatedUser, id: string, input: PurchaseInput) {
  const existing = await prisma.purchase.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!existing) throw ApiError.notFound('Purchase not found.');
  if (existing.status !== 'DRAFT') throw ApiError.badRequest('Only draft purchases can be edited.');

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
      receivedQuantity: 0,
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
          items: { create: itemsData },
        },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getPurchase(user, id);
}

export async function orderPurchase(user: AuthenticatedUser, id: string) {
  const purchase = await prisma.purchase.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  if (purchase.status !== 'DRAFT') throw ApiError.badRequest('Only draft purchases can be ordered.');

  const updated = await prisma.purchase.update({
    where: { id },
    data: { status: 'ORDERED', orderedAt: new Date() },
    include: PURCHASE_INCLUDE,
  });

  return toDto(updated);
}

export async function receivePurchaseItems(user: AuthenticatedUser, id: string, input: ReceiveInput) {
  const purchase = await prisma.purchase.findFirst({
    where: { id, ...scopeWarehouseWhere(user) },
    include: { items: true },
  });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  if (purchase.status !== 'ORDERED' && purchase.status !== 'PARTIALLY_RECEIVED') {
    throw ApiError.badRequest('Only ordered or partially received purchases can receive items.');
  }

  const itemById = new Map(purchase.items.map((item) => [item.productId, item]));

  const updates: { productId: string; qty: number }[] = [];
  for (const line of input.items) {
    const item = itemById.get(line.productId);
    if (!item) throw ApiError.badRequest(`Product ${line.productId} is not in this purchase.`);

    const remaining = item.quantity - item.receivedQuantity;
    if (line.receivedQty < 0) throw ApiError.badRequest('Received quantity cannot be negative.');
    if (line.receivedQty > remaining) {
      throw ApiError.badRequest(`Cannot receive more than ${remaining} remaining for ${item.productId}.`);
    }
    if (line.receivedQty > 0) {
      updates.push({ productId: line.productId, qty: line.receivedQty });
    }
  }

  if (updates.length === 0) {
    throw ApiError.badRequest('No items to receive.');
  }

  await prisma.$transaction(
    async (tx) => {
      for (const update of updates) {
        const item = itemById.get(update.productId)!;
        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { receivedQuantity: { increment: update.qty } },
        });
        for (const op of addStockInTransaction(tx, update.productId, purchase.warehouseId, update.qty, `PO ${purchase.purchaseNumber}`)) {
          await op;
        }
      }

      const allItems = await tx.purchaseItem.findMany({ where: { purchaseId: id } });
      const allReceived = allItems.every((item) => item.receivedQuantity >= item.quantity);

      await tx.purchase.update({
        where: { id },
        data: allReceived
          ? { status: 'RECEIVED', receivedAt: new Date() }
          : { status: 'PARTIALLY_RECEIVED' },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  for (const update of updates) {
    await checkLowStock(update.productId, purchase.warehouseId);
  }
  await createNotification({
    warehouseId: purchase.warehouseId,
    type: 'PURCHASE_RECEIVED',
    title: 'Purchase received',
    message: `Purchase order ${purchase.purchaseNumber} received a stock delivery.`,
    metadata: { purchaseId: purchase.id, purchaseNumber: purchase.purchaseNumber },
  });

  return getPurchase(user, id);
}

export async function cancelPurchase(user: AuthenticatedUser, id: string) {
  const purchase = await prisma.purchase.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  if (purchase.status === 'RECEIVED') throw ApiError.badRequest('A received purchase cannot be cancelled.');
  if (purchase.status === 'CANCELLED') throw ApiError.badRequest('Purchase is already cancelled.');

  const updated = await prisma.purchase.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: PURCHASE_INCLUDE,
  });

  return toDto(updated);
}
