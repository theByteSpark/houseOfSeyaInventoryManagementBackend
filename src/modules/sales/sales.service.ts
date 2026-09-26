import type { SaleStatus, Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { isCompanyLevel, requireWarehouseId } from '@/utils/warehouseScope';
import { checkLowStock } from '@/modules/inventory/inventory.service';
import { createNotification } from '@/modules/notifications/notifications.service';
import type { SaleInput } from './sales.validation';

// Tax is a flat rate across all products — not user-configurable per sale.
export const SALES_TAX_RATE = 0.18;

const SALE_INCLUDE = {
  customer: { select: { name: true, email: true, phone: true, address: true } },
  warehouse: { select: { name: true } },
  items: { include: { product: { select: { name: true, sku: true } } } },
} satisfies Prisma.SaleInclude;

type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

function toDto(sale: SaleWithRelations) {
  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    customerId: sale.customerId,
    customerName: sale.customer.name,
    warehouseId: sale.warehouseId,
    warehouseName: sale.warehouse.name,
    status: sale.status,
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    total: Number(sale.total),
    issuedAt: sale.issuedAt,
    completionDate: sale.completionDate,
    createdAt: sale.createdAt,
  };
}

async function nextSaleNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.sale.count();
  return `SALE-${year}-${String(count + 1).padStart(4, '0')}`;
}

// Warehouse-scoped roles (USER/ADMIN) are always locked to their own warehouse.
// Company-level roles see everything by default, but may narrow to one
// warehouse via the optional `warehouseId` filter param.
function scopeWarehouseWhere(user: AuthenticatedUser, warehouseId?: string): Prisma.SaleWhereInput {
  if (!isCompanyLevel(user)) return { warehouseId: user.warehouseId ?? '__none__' };
  return warehouseId ? { warehouseId } : {};
}

export async function listSales(user: AuthenticatedUser, statusFilter?: SaleStatus | 'ALL', warehouseId?: string) {
  const where: Prisma.SaleWhereInput = {
    AND: [
      scopeWarehouseWhere(user, warehouseId),
      ...(!statusFilter || statusFilter === 'ALL' ? [] : [{ status: statusFilter }]),
    ],
  };
  const sales = await prisma.sale.findMany({
    where,
    include: SALE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return sales.map(toDto);
}

export async function listSalesPaginated(
  user: AuthenticatedUser,
  params: PaginationParams,
  statusFilter: SaleStatus | 'ALL',
  warehouseId?: string,
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

  const where: Prisma.SaleWhereInput = {
    AND: [
      scopeWarehouseWhere(user, warehouseId),
      searchFilter,
      ...(statusFilter === 'ALL' ? [] : [{ status: statusFilter }]),
    ],
  };

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

export async function getSale(user: AuthenticatedUser, id: string) {
  const sale = await prisma.sale.findFirst({
    where: { id, ...scopeWarehouseWhere(user) },
    include: SALE_INCLUDE,
  });
  if (!sale) throw ApiError.notFound('Sale not found.');
  return toDto(sale);
}

// Creates the Sale + SaleItems and immediately decrements stock for each line
// item in the same transaction, since a sale is OUTWARD_TRANSIT (stock
// already committed) from the moment it's created. Throws if any line item
// doesn't have enough stock at the warehouse, rolling back the whole create.
export async function createSale(user: AuthenticatedUser, input: SaleInput) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found.');

  const warehouseId = requireWarehouseId(user, input.warehouseId);

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);

    const unitPrice = line.unitPrice;
    const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
    subtotal += lineTotal;

    return {
      productId: product.id,
      productName: product.name,
      quantity: line.quantity,
      unitPrice,
      lineTotal,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  const tax = Math.round(subtotal * SALES_TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  const saleNumber = await nextSaleNumber();

  const sale = await prisma.$transaction(
    async (tx) => {
      for (const item of itemsData) {
        const stock = await tx.productStock.findUnique({
          where: { productId_warehouseId: { productId: item.productId, warehouseId } },
        });
        if (!stock || stock.quantity < item.quantity) {
          throw ApiError.badRequest(`Not enough stock for ${item.productName}.`);
        }
      }

      const created = await tx.sale.create({
        data: {
          saleNumber,
          customerId: customer.id,
          warehouseId,
          status: 'OUTWARD_TRANSIT',
          issuedAt: new Date(),
          completionDate: input.completionDate,
          subtotal,
          tax,
          total,
          items: {
            create: itemsData.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
            })),
          },
        },
        include: SALE_INCLUDE,
      });

      for (const item of itemsData) {
        await tx.productStock.update({
          where: { productId_warehouseId: { productId: item.productId, warehouseId } },
          data: { quantity: { decrement: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId,
            type: 'SALE',
            quantity: -item.quantity,
            reason: `Sale ${saleNumber}`,
          },
        });
      }

      return created;
    },
    { timeout: 15000, maxWait: 15000 },
  );

  for (const item of itemsData) {
    await checkLowStock(item.productId, warehouseId);
  }
  await createNotification({
    warehouseId,
    type: 'SALE_ISSUED',
    title: 'Sale confirmed',
    message: `Sale ${sale.saleNumber} for ${customer.name} was confirmed.`,
    metadata: { saleId: sale.id, saleNumber: sale.saleNumber },
  });

  return toDto(sale);
}

// Editing a sale while it's still OUTWARD_TRANSIT reverses the stock impact
// of its current line items, then re-applies the new ones — same as if the
// old sale were cancelled and a new one created, but keeping the same
// saleNumber/id. Throws if the new line items don't have enough stock once
// the old ones are given back.
export async function updateSale(user: AuthenticatedUser, id: string, input: SaleInput) {
  const existing = await prisma.sale.findFirst({ where: { id, ...scopeWarehouseWhere(user) }, include: SALE_INCLUDE });
  if (!existing) throw ApiError.notFound('Sale not found.');
  if (existing.status !== 'OUTWARD_TRANSIT') {
    throw ApiError.badRequest('Only sales in outward transit can be edited.');
  }

  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found.');

  const warehouseId = existing.warehouseId;

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);

    const unitPrice = line.unitPrice;
    const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
    subtotal += lineTotal;

    return {
      productId: product.id,
      productName: product.name,
      quantity: line.quantity,
      unitPrice,
      lineTotal,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  const tax = Math.round(subtotal * SALES_TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  await prisma.$transaction(
    async (tx) => {
      // Give back stock for the sale's current items first.
      for (const item of existing.items) {
        await tx.productStock.upsert({
          where: { productId_warehouseId: { productId: item.productId, warehouseId } },
          update: { quantity: { increment: item.quantity } },
          create: { productId: item.productId, warehouseId, quantity: item.quantity },
        });
      }

      // Then validate and deduct stock for the new items.
      for (const item of itemsData) {
        const stock = await tx.productStock.findUnique({
          where: { productId_warehouseId: { productId: item.productId, warehouseId } },
        });
        if (!stock || stock.quantity < item.quantity) {
          throw ApiError.badRequest(`Not enough stock for ${item.productName}.`);
        }
      }
      for (const item of itemsData) {
        await tx.productStock.update({
          where: { productId_warehouseId: { productId: item.productId, warehouseId } },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.sale.update({
        where: { id },
        data: {
          customerId: customer.id,
          completionDate: input.completionDate,
          subtotal,
          tax,
          total,
          items: {
            create: itemsData.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
            })),
          },
        },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  for (const item of itemsData) {
    await checkLowStock(item.productId, warehouseId);
  }

  return getSale(user, id);
}

export async function completeSale(user: AuthenticatedUser, id: string) {
  const sale = await prisma.sale.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!sale) throw ApiError.notFound('Sale not found.');
  if (sale.status !== 'OUTWARD_TRANSIT') {
    throw ApiError.badRequest('Only sales in outward transit can be marked as done.');
  }

  // completionDate is overwritten to the actual completion date rather than
  // kept at the original target, so it reflects when the sale really finished.
  await prisma.sale.update({ where: { id }, data: { status: 'DONE', completionDate: new Date() } });
  return getSale(user, id);
}

export async function cancelSale(user: AuthenticatedUser, id: string) {
  const sale = await prisma.sale.findFirst({ where: { id, ...scopeWarehouseWhere(user) }, include: SALE_INCLUDE });
  if (!sale) throw ApiError.notFound('Sale not found.');
  if (sale.status !== 'OUTWARD_TRANSIT') {
    throw ApiError.badRequest('Only sales in outward transit can be cancelled.');
  }

  await prisma.$transaction(
    async (tx) => {
      for (const item of sale.items) {
        await tx.productStock.upsert({
          where: { productId_warehouseId: { productId: item.productId, warehouseId: sale.warehouseId } },
          update: { quantity: { increment: item.quantity } },
          create: { productId: item.productId, warehouseId: sale.warehouseId, quantity: item.quantity },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: sale.warehouseId,
            type: 'ADJUSTMENT',
            quantity: item.quantity,
            reason: `Cancelled sale ${sale.saleNumber}`,
          },
        });
      }

      await tx.sale.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getSale(user, id);
}
