import type { Prisma, PurchaseStatus } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { PurchaseInput } from './purchases.validation';
import { PRODUCT_INCLUDE, toProductDto } from '@/modules/inventory/inventory.service';

const PURCHASE_INCLUDE = {
  vendor: { select: { companyName: true, contactPerson: true, email: true, phone: true, address: true } },
  items: { include: { product: { include: PRODUCT_INCLUDE } } },
} satisfies Prisma.PurchaseInclude;

type PurchaseWithRelations = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

function toDto(purchase: PurchaseWithRelations) {
  const items = purchase.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    designNumber: item.product.designNumber,
    // Full cost-sheet DTO — the Purchase form's edit flow reconstructs each
    // line's full detail card/edit-modal from this instead of just a name.
    product: toProductDto(item.product),
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
    vendorInvoiceNumber: purchase.vendorInvoiceNumber,
    vendorInvoiceDate: purchase.vendorInvoiceDate,
    orderedAt: purchase.orderedAt,
    receivedAt: purchase.receivedAt,
    createdAt: purchase.createdAt,
  };
}

export async function nextPurchaseNumber(): Promise<string> {
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

  // By the time someone enters a purchase, the items have already arrived --
  // it lands straight on Received (same reasoning as Sale committing
  // straight to Sold), so there's no separate "mark as ordered" step to wait
  // for. receivedQuantity/stock/product status are all set immediately,
  // same as receivePurchase does for a legacy Ordered one.
  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);

    const lineTotal = Math.round(line.unitCost * line.quantity * 100) / 100;
    return {
      productId: product.id,
      quantity: line.quantity,
      receivedQuantity: line.quantity,
      unitCost: line.unitCost,
      lineTotal,
    };
  });

  const purchaseNumber = await nextPurchaseNumber();
  const now = new Date();

  const purchase = await prisma.$transaction(
    async (tx) => {
      const created = await tx.purchase.create({
        data: {
          purchaseNumber,
          vendorId: vendor.id,
          status: 'RECEIVED',
          orderedAt: now,
          receivedAt: now,
          vendorInvoiceNumber: input.vendorInvoiceNumber || null,
          vendorInvoiceDate: input.vendorInvoiceDate ? new Date(input.vendorInvoiceDate) : null,
          items: { create: itemsData },
        },
      });

      for (const line of input.items) {
        await tx.product.update({
          where: { id: line.productId },
          data: { quantityInStock: { increment: line.quantity }, status: 'ACTIVE' },
        });
        await tx.stockMovement.create({
          data: { productId: line.productId, type: 'RESTOCK', quantity: line.quantity, reason: `PO ${purchaseNumber}` },
        });
      }

      return created;
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getPurchase(purchase.id);
}

export async function updatePurchase(id: string, input: PurchaseInput) {
  const existing = await prisma.purchase.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw ApiError.notFound('Purchase not found.');
  if (existing.status !== 'ORDERED' && existing.status !== 'RECEIVED') {
    throw ApiError.badRequest('Only ordered or received purchases can be edited.');
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw ApiError.notFound('Vendor not found.');

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const wasReceived = existing.status === 'RECEIVED';
  const oldItemByProductId = new Map(existing.items.map((item) => [item.productId, item]));
  const newProductIds = new Set(productIds);

  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);

    const lineTotal = Math.round(line.unitCost * line.quantity * 100) / 100;
    // A line already on this purchase keeps its existing receipt state; a
    // newly-added line on an already-Received purchase is received
    // immediately too, same as a fresh purchase.
    const existingItem = oldItemByProductId.get(line.productId);
    const receivedQuantity = existingItem ? existingItem.receivedQuantity : wasReceived ? line.quantity : 0;

    return {
      productId: product.id,
      quantity: line.quantity,
      receivedQuantity,
      unitCost: line.unitCost,
      lineTotal,
    };
  });

  const removedItems = [...oldItemByProductId.values()].filter((item) => !newProductIds.has(item.productId));
  const addedProductIds = wasReceived ? productIds.filter((pid) => !oldItemByProductId.has(pid)) : [];

  if (wasReceived && removedItems.length > 0) {
    const removedProducts = await prisma.product.findMany({
      where: { id: { in: removedItems.map((item) => item.productId) } },
      include: { _count: { select: { saleItems: true } } },
    });
    const alreadySold = removedProducts.find((p) => p._count.saleItems > 0);
    if (alreadySold) {
      throw ApiError.badRequest(`Cannot remove ${alreadySold.name} — it has already been sold.`);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });

      if (wasReceived) {
        // A line dropped from an already-Received purchase only existed
        // because of this purchase (one-of-a-kind, same reasoning as
        // cancelPurchase's Received-cancel) -- remove it from Inventory
        // entirely rather than leaving an orphaned product behind.
        for (const item of removedItems) {
          await tx.stockMovement.deleteMany({ where: { productId: item.productId } });
          await tx.product.delete({ where: { id: item.productId } });
        }

        for (const pid of addedProductIds) {
          const line = input.items.find((l) => l.productId === pid)!;
          await tx.product.update({
            where: { id: pid },
            data: { quantityInStock: { increment: line.quantity }, status: 'ACTIVE' },
          });
          await tx.stockMovement.create({
            data: { productId: pid, type: 'RESTOCK', quantity: line.quantity, reason: `PO ${existing.purchaseNumber}` },
          });
        }
      }

      await tx.purchase.update({
        where: { id },
        data: {
          vendorId: vendor.id,
          vendorInvoiceNumber: input.vendorInvoiceNumber || null,
          vendorInvoiceDate: input.vendorInvoiceDate ? new Date(input.vendorInvoiceDate) : null,
          items: { create: itemsData },
        },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getPurchase(id);
}

export async function receivePurchase(id: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  if (purchase.status !== 'ORDERED') throw ApiError.badRequest('Only ordered purchases can be received.');

  await prisma.$transaction(
    async (tx) => {
      for (const item of purchase.items) {
        const remaining = item.quantity - item.receivedQuantity;
        if (remaining <= 0) continue;

        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.quantity },
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { quantityInStock: { increment: remaining }, status: 'ACTIVE' },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'RESTOCK',
            quantity: remaining,
            reason: `PO ${purchase.purchaseNumber}`,
          },
        });
      }

      await tx.purchase.update({
        where: { id },
        data: { status: 'RECEIVED', receivedAt: new Date() },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getPurchase(id);
}

export async function cancelPurchase(id: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      items: { include: { product: { include: { _count: { select: { saleItems: true } } } } } },
    },
  });
  if (!purchase) throw ApiError.notFound('Purchase not found.');
  if (purchase.status === 'CANCELLED') throw ApiError.badRequest('Purchase is already cancelled.');
  if (purchase.status !== 'ORDERED' && purchase.status !== 'RECEIVED') {
    throw ApiError.badRequest('Only ordered or received purchases can be cancelled.');
  }

  if (purchase.status === 'RECEIVED') {
    const alreadySold = purchase.items.find((item) => item.product._count.saleItems > 0);
    if (alreadySold) {
      throw ApiError.badRequest(`Cannot cancel — ${alreadySold.product.name} has already been sold.`);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      if (purchase.status === 'RECEIVED') {
        // Every product on a purchase exists solely because of that
        // purchase (one-of-a-kind, per inventory.service.ts's deleteProduct
        // comment) -- cancelling a received one undoes the acquisition
        // entirely, so the product is deleted from Inventory the same way,
        // guarded by the same "not already sold" check above.
        for (const item of purchase.items) {
          await tx.stockMovement.deleteMany({ where: { productId: item.productId } });
          await tx.purchaseItem.deleteMany({ where: { productId: item.productId } });
          await tx.product.delete({ where: { id: item.productId } });
        }
      }

      await tx.purchase.update({ where: { id }, data: { status: 'CANCELLED' } });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getPurchase(id);
}
