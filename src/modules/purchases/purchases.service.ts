import type { PurchaseStatus, Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { PurchaseInput, ReceiveInput } from './purchases.validation';

const PURCHASE_INCLUDE = {
  vendor: { select: { companyName: true, contactPerson: true, email: true, phone: true, address: true } },
  items: { include: { product: { select: { name: true, designNumber: true } } } },
} satisfies Prisma.PurchaseInclude;

type PurchaseWithRelations = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

function toDto(purchase: PurchaseWithRelations) {
  const items = purchase.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    designNumber: item.product.designNumber,
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

export async function listPurchases() {
  const purchases = await prisma.purchase.findMany({
    include: PURCHASE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return purchases.map(toDto);
}

export async function listPurchasesPaginated(
  params: PaginationParams,
  statusFilter: PurchaseStatus | 'ALL',
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

  const where: Prisma.PurchaseWhereInput =
    statusFilter === 'ALL' ? searchFilter : { AND: [searchFilter, { status: statusFilter }] };

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

export async function getPurchase(id: string) {
  const purchase = await prisma.purchase.findUnique({ where: { id }, include: PURCHASE_INCLUDE });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  return toDto(purchase);
}

export async function createPurchase(input: PurchaseInput) {
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

  const purchaseNumber = await nextPurchaseNumber();

  const purchase = await prisma.purchase.create({
    data: {
      purchaseNumber,
      vendorId: vendor.id,
      status: 'DRAFT',
      items: { create: itemsData },
    },
    include: PURCHASE_INCLUDE,
  });

  return toDto(purchase);
}

export async function updatePurchase(id: string, input: PurchaseInput) {
  const existing = await prisma.purchase.findUnique({ where: { id } });
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

  return getPurchase(id);
}

export async function orderPurchase(id: string) {
  const purchase = await prisma.purchase.findUnique({ where: { id } });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  if (purchase.status !== 'DRAFT') throw ApiError.badRequest('Only draft purchases can be ordered.');

  const updated = await prisma.purchase.update({
    where: { id },
    data: { status: 'ORDERED', orderedAt: new Date() },
    include: PURCHASE_INCLUDE,
  });

  return toDto(updated);
}

export async function receivePurchaseItems(id: string, input: ReceiveInput) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
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
        await tx.product.update({
          where: { id: update.productId },
          data: { quantityInStock: { increment: update.qty } },
        });
        await tx.stockMovement.create({
          data: {
            productId: update.productId,
            type: 'RESTOCK',
            quantity: update.qty,
            reason: `PO ${purchase.purchaseNumber}`,
          },
        });
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

  return getPurchase(id);
}

export async function cancelPurchase(id: string) {
  const purchase = await prisma.purchase.findUnique({ where: { id } });
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
