import type { SaleStatus, Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import { deductStockInTransaction, PRODUCT_INCLUDE, toProductDto } from '@/modules/inventory/inventory.service';
import type { SaleInput } from './sales.validation';

export const TAX_RATE = 0.03;

const SALE_INCLUDE = {
  customer: { select: { name: true, email: true, phone: true, address: true } },
  items: {
    include: {
      // Full cost-sheet DTO — the Sale detail page shows the same
      // metal/diamond/labour cost breakdown the Sale form shows while
      // selecting the product, not just its name.
      product: { include: PRODUCT_INCLUDE },
    },
  },
} satisfies Prisma.SaleInclude;

type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

// Selling price is tax-inclusive: tax is still computed and reported (the
// Reports "tax collected" figure), but is never added on top of the
// subtotal. Total is the subtotal minus whichever discount was given — the
// two discount fields are mutually exclusive, enforced in sales.validation.ts.
export function computeSaleTotals(subtotal: number, discountPercent?: number, discountAmount?: number) {
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const discountValue =
    discountPercent !== undefined
      ? Math.round(subtotal * (discountPercent / 100) * 100) / 100
      : Math.round(Math.min(discountAmount ?? 0, subtotal) * 100) / 100;
  const total = Math.round((subtotal - discountValue) * 100) / 100;
  return { tax, discountValue, total };
}

function statusForPayment(receivedAmount: number, total: number): SaleStatus {
  return receivedAmount >= total ? 'PAID' : 'SOLD';
}

function toDto(sale: SaleWithRelations) {
  const discountPercent = sale.discountPercent !== null ? Number(sale.discountPercent) : null;
  const discountAmount = sale.discountAmount !== null ? Number(sale.discountAmount) : null;
  const subtotal = Number(sale.subtotal);
  const total = Number(sale.total);
  const receivedAmount = Number(sale.receivedAmount);

  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    customerId: sale.customerId,
    customerName: sale.customer.name,
    status: sale.status,
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      designNumber: item.product.designNumber,
      subcategoryName: item.product.subcategory?.name ?? null,
      product: toProductDto(item.product),
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    subtotal,
    tax: Number(sale.tax),
    discountPercent,
    discountAmount,
    discountValue: Math.round((subtotal - total) * 100) / 100,
    total,
    receivedAmount,
    balanceDue: Math.round((total - receivedAmount) * 100) / 100,
    soldAt: sale.soldAt,
    paidAt: sale.paidAt,
    createdAt: sale.createdAt,
  };
}

// A product on a purchase that hasn't been received yet can still be sold
// (billed in advance, on backorder) -- so Sale accepts ACTIVE or ORDERED,
// never SOLD (already committed elsewhere). Only an ACTIVE product has real
// stock to deduct; an ORDERED one has none yet, so nothing is decremented
// for it until its purchase is eventually received (see receivePurchase's
// own "don't downgrade an already-sold product" guard).
async function fetchReceivedMap(
  client: Pick<Prisma.TransactionClient, 'purchaseItem'> | typeof prisma,
  productIds: string[],
): Promise<Map<string, boolean>> {
  if (productIds.length === 0) return new Map();
  const items = await client.purchaseItem.findMany({ where: { productId: { in: productIds } } });
  return new Map(items.map((item) => [item.productId, item.receivedQuantity >= item.quantity]));
}

export async function nextSaleNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.sale.count();
  return `SALE-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function listSales() {
  const sales = await prisma.sale.findMany({
    include: SALE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return sales.map(toDto);
}

export async function listSalesPaginated(
  params: PaginationParams,
  statusFilter: SaleStatus | 'ALL',
): Promise<PaginatedResult<ReturnType<typeof toDto>>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const searchFilter: Prisma.SaleWhereInput = search
    ? {
        OR: [
          { saleNumber: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
          { items: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
        ],
      }
    : {};

  const where: Prisma.SaleWhereInput =
    statusFilter === 'ALL' ? searchFilter : { AND: [searchFilter, { status: statusFilter }] };

  const orderBy: Prisma.SaleOrderByWithRelationInput =
    sortBy === 'customer'
      ? { customer: { name: sortDir } }
      : sortBy === 'saleNumber' || sortBy === 'status' || sortBy === 'total' || sortBy === 'createdAt'
        ? { [sortBy]: sortDir }
        : { createdAt: 'desc' };

  const [total, sales] = await prisma.$transaction([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      include: SALE_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: sales.map(toDto), total, page, pageSize };
}

export async function getSale(id: string) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
  if (!sale) throw ApiError.notFound('Sale not found.');
  return toDto(sale);
}

export async function createSale(input: SaleInput) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found.');

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);
    if (product.status !== 'ACTIVE' && product.status !== 'ORDERED') {
      throw ApiError.badRequest(`${product.name} is not available to sell.`);
    }

    const unitPrice = Number(product.sellingPrice);
    const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
    subtotal += lineTotal;

    return {
      productId: product.id,
      quantity: line.quantity,
      unitPrice,
      lineTotal,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  const { tax, total } = computeSaleTotals(subtotal, input.discountPercent, input.discountAmount);
  const receivedAmount = input.receivedAmount;
  const resultingStatus = statusForPayment(receivedAmount, total);
  const now = new Date();
  const saleNumber = await nextSaleNumber();

  const saleId = await prisma.$transaction(
    async (tx) => {
      const created = await tx.sale.create({
        data: {
          saleNumber,
          customerId: customer.id,
          status: resultingStatus,
          subtotal,
          tax,
          discountPercent: input.discountPercent ?? null,
          discountAmount: input.discountAmount ?? null,
          receivedAmount,
          total,
          soldAt: now,
          paidAt: resultingStatus === 'PAID' ? now : null,
          items: { create: itemsData },
        },
      });

      for (const line of input.items) {
        const product = productById.get(line.productId)!;
        if (product.status === 'ACTIVE') {
          for (const op of deductStockInTransaction(tx, line.productId, line.quantity, `Sale ${saleNumber}`)) {
            await op;
          }
        }
        await tx.product.update({ where: { id: line.productId }, data: { status: 'SOLD' } });
      }

      return created.id;
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getSale(saleId);
}

export async function updateSale(id: string, input: SaleInput) {
  const existing = await prisma.sale.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw ApiError.notFound('Sale not found.');
  if (existing.status === 'CANCELLED') throw ApiError.badRequest('A cancelled sale cannot be edited.');

  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found.');

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const oldItemByProductId = new Map(existing.items.map((item) => [item.productId, item]));
  const newProductIds = new Set(productIds);

  let subtotal = 0;
  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);

    // A line already on this sale is expected to be SOLD (by this sale) —
    // only a newly-added line needs to currently be sellable.
    if (!oldItemByProductId.has(line.productId) && product.status !== 'ACTIVE' && product.status !== 'ORDERED') {
      throw ApiError.badRequest(`${product.name} is not available to sell.`);
    }

    const unitPrice = Number(product.sellingPrice);
    const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
    subtotal += lineTotal;

    return {
      productId: product.id,
      quantity: line.quantity,
      unitPrice,
      lineTotal,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  const { tax, total } = computeSaleTotals(subtotal, input.discountPercent, input.discountAmount);
  const receivedAmount = input.receivedAmount;
  const resultingStatus = statusForPayment(receivedAmount, total);
  const paidAt = resultingStatus === 'PAID' ? (existing.status === 'PAID' ? existing.paidAt : new Date()) : null;

  const removedItems = [...oldItemByProductId.values()].filter((item) => !newProductIds.has(item.productId));
  const addedProductIds = productIds.filter((pid) => !oldItemByProductId.has(pid));

  // A removed line's product only reverts to Active+stock if it was
  // actually received from the vendor already — one sold while still
  // Ordered (on backorder) never had stock to give back, so it goes back
  // to Ordered instead.
  const receivedMap = await fetchReceivedMap(prisma, removedItems.map((item) => item.productId));

  await prisma.$transaction(
    async (tx) => {
      for (const item of removedItems) {
        const wasReceived = receivedMap.get(item.productId) ?? false;
        if (wasReceived) {
          await tx.product.update({
            where: { id: item.productId },
            data: { status: 'ACTIVE', quantityInStock: { increment: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'ADJUSTMENT',
              quantity: item.quantity,
              reason: `Removed from ${existing.saleNumber}`,
            },
          });
        } else {
          await tx.product.update({ where: { id: item.productId }, data: { status: 'ORDERED' } });
        }
      }

      for (const pid of addedProductIds) {
        const line = input.items.find((l) => l.productId === pid)!;
        const product = productById.get(pid)!;
        if (product.status === 'ACTIVE') {
          for (const op of deductStockInTransaction(tx, pid, line.quantity, `Sale ${existing.saleNumber}`)) {
            await op;
          }
        }
        await tx.product.update({ where: { id: pid }, data: { status: 'SOLD' } });
      }

      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.sale.update({
        where: { id },
        data: {
          customerId: customer.id,
          subtotal,
          tax,
          discountPercent: input.discountPercent ?? null,
          discountAmount: input.discountAmount ?? null,
          receivedAmount,
          total,
          status: resultingStatus,
          paidAt,
          items: { create: itemsData },
        },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getSale(id);
}

export async function markSalePaid(id: string) {
  const sale = await prisma.sale.findUnique({ where: { id } });
  if (!sale) throw ApiError.notFound('Sale not found.');
  if (sale.status !== 'SOLD') throw ApiError.badRequest('Only sold sales can be marked as paid.');

  const updated = await prisma.sale.update({
    where: { id },
    data: { status: 'PAID', paidAt: new Date() },
    include: SALE_INCLUDE,
  });

  return toDto(updated);
}

export async function cancelSale(id: string) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: { items: true } });
  if (!sale) throw ApiError.notFound('Sale not found.');
  if (sale.status === 'CANCELLED') throw ApiError.badRequest('Sale is already cancelled.');

  // Same as updateSale's removed-line reconciliation: only revert to
  // Active+stock if the product was actually received; one sold while
  // still Ordered (on backorder) goes back to Ordered instead.
  const receivedMap = await fetchReceivedMap(prisma, sale.items.map((item) => item.productId));

  await prisma.$transaction(
    async (tx) => {
      for (const item of sale.items) {
        const wasReceived = receivedMap.get(item.productId) ?? false;
        if (wasReceived) {
          await tx.product.update({
            where: { id: item.productId },
            data: { status: 'ACTIVE', quantityInStock: { increment: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'ADJUSTMENT',
              quantity: item.quantity,
              reason: `Sale ${sale.saleNumber} cancelled`,
            },
          });
        } else {
          await tx.product.update({ where: { id: item.productId }, data: { status: 'ORDERED' } });
        }
      }

      await tx.sale.update({ where: { id }, data: { status: 'CANCELLED' } });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getSale(id);
}

export async function getSaleForInvoice(id: string) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
  if (!sale) throw ApiError.notFound('Sale not found.');
  return sale;
}
