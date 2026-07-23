import type { SaleStatus, Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import { deductStockInTransaction } from '@/modules/inventory/inventory.service';
import type { SaleInput } from './sales.validation';

const SALE_INCLUDE = {
  customer: { select: { name: true, email: true, phone: true, address: true } },
  items: { include: { product: { select: { name: true, sku: true } } } },
} satisfies Prisma.SaleInclude;

type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

function toDto(sale: SaleWithRelations) {
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
      sku: item.product.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    total: Number(sale.total),
    issuedAt: sale.issuedAt,
    createdAt: sale.createdAt,
  };
}

async function nextSaleNumber(): Promise<string> {
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

    const unitPrice = Number(product.unitPrice);
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
  const taxRate = input.taxRate ?? 0.1;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  const saleNumber = await nextSaleNumber();

  const sale = await prisma.sale.create({
    data: {
      saleNumber,
      customerId: customer.id,
      status: 'DRAFT',
      subtotal,
      tax,
      total,
      items: { create: itemsData },
    },
    include: SALE_INCLUDE,
  });

  return toDto(sale);
}

export async function updateSale(id: string, input: SaleInput) {
  const existing = await prisma.sale.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Sale not found.');
  if (existing.status !== 'DRAFT') throw ApiError.badRequest('Only draft sales can be edited.');

  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found.');

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);

    const unitPrice = Number(product.unitPrice);
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
  const taxRate = input.taxRate ?? 0.1;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  await prisma.$transaction(
    async (tx) => {
      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.sale.update({
        where: { id },
        data: {
          customerId: customer.id,
          subtotal,
          tax,
          total,
          items: { create: itemsData },
        },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return getSale(id);
}

async function transitionSale(id: string, status: SaleStatus) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
  if (!sale) throw ApiError.notFound('Sale not found.');

  if (status === 'ISSUED') {
    if (sale.status !== 'DRAFT') throw ApiError.badRequest('Only draft sales can be issued.');

    const productIds = sale.items.map((item) => item.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productById = new Map(products.map((p) => [p.id, p]));

    for (const item of sale.items) {
      const product = productById.get(item.productId);
      if (!product || product.quantityInStock < item.quantity) {
        throw ApiError.badRequest(`Not enough stock for ${item.product.name}.`);
      }
    }

    await prisma.$transaction(
      async (tx) => {
        for (const item of sale.items) {
          for (const op of deductStockInTransaction(tx, item.productId, item.quantity, `Sale ${sale.saleNumber}`)) {
            await op;
          }
        }
        await tx.sale.update({
          where: { id },
          data: { status: 'ISSUED', issuedAt: new Date() },
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );

    return getSale(id);
  }

  if (status === 'CANCELLED' && sale.status === 'PAID') {
    throw ApiError.badRequest('A paid sale cannot be cancelled.');
  }

  if (status === 'PAID' && sale.status !== 'ISSUED') {
    throw ApiError.badRequest('Only issued sales can be marked as paid.');
  }

  const updated = await prisma.sale.update({
    where: { id },
    data: { status },
    include: SALE_INCLUDE,
  });

  return toDto(updated);
}

export async function issueSale(id: string) {
  return transitionSale(id, 'ISSUED');
}

export async function markSalePaid(id: string) {
  return transitionSale(id, 'PAID');
}

export async function cancelSale(id: string) {
  return transitionSale(id, 'CANCELLED');
}

export async function getSaleForInvoice(id: string) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
  if (!sale) throw ApiError.notFound('Sale not found.');
  return sale;
}
