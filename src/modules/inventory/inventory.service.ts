import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { CategoryInput, ProductInput, RestockInput } from './inventory.validation';

function toProductDto(product: {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unitPrice: Prisma.Decimal;
  quantityInStock: number;
  reorderLevel: number;
  categoryId: string | null;
  category: { name: string } | null;
  createdAt: Date;
}) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unitPrice: Number(product.unitPrice),
    quantityInStock: product.quantityInStock,
    reorderLevel: product.reorderLevel,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    createdAt: product.createdAt,
  };
}

export async function listProducts() {
  const products = await prisma.product.findMany({
    include: { category: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return products.map(toProductDto);
}

export async function listProductsPaginated(
  params: PaginationParams,
  stockFilter: 'all' | 'low',
): Promise<PaginatedResult<ReturnType<typeof toProductDto>>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const searchFilter: Prisma.ProductWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { category: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }
    : {};

  const lowStockIds =
    stockFilter === 'low'
      ? (
          await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Product" WHERE "quantityInStock" <= "reorderLevel"`
        ).map((row) => row.id)
      : null;

  const where: Prisma.ProductWhereInput =
    lowStockIds !== null ? { AND: [searchFilter, { id: { in: lowStockIds } }] } : searchFilter;

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sortBy === 'category'
      ? { category: { name: sortDir } }
      : sortBy === 'name' || sortBy === 'sku' || sortBy === 'unitPrice' || sortBy === 'quantityInStock' || sortBy === 'createdAt'
        ? { [sortBy]: sortDir }
        : { createdAt: 'desc' };

  const [total, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: { select: { name: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: products.map(toProductDto), total, page, pageSize };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: { select: { name: true } } },
  });
  if (!product) throw ApiError.notFound('Product not found.');
  return toProductDto(product);
}

export async function createProduct(input: ProductInput) {
  const existing = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (existing) throw ApiError.conflict('A product with this SKU already exists.');

  const product = await prisma.product.create({
    data: {
      sku: input.sku,
      name: input.name,
      description: input.description || null,
      unitPrice: input.unitPrice,
      quantityInStock: input.quantityInStock,
      reorderLevel: input.reorderLevel,
      categoryId: input.categoryId || null,
    },
    include: { category: { select: { name: true } } },
  });

  if (input.quantityInStock > 0) {
    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        type: 'RESTOCK',
        quantity: input.quantityInStock,
        reason: 'Initial stock',
      },
    });
  }

  return toProductDto(product);
}

export async function updateProduct(id: string, input: ProductInput) {
  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('Product not found.');

  if (input.sku !== current.sku) {
    const existing = await prisma.product.findUnique({ where: { sku: input.sku } });
    if (existing) throw ApiError.conflict('A product with this SKU already exists.');
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      sku: input.sku,
      name: input.name,
      description: input.description || null,
      unitPrice: input.unitPrice,
      reorderLevel: input.reorderLevel,
      categoryId: input.categoryId || null,
    },
    include: { category: { select: { name: true } } },
  });

  return toProductDto(product);
}

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw ApiError.notFound('Product not found.');
  await prisma.product.delete({ where: { id } });
}

export async function restockProduct(id: string, input: RestockInput) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw ApiError.notFound('Product not found.');

  const [updated] = await prisma.$transaction([
    prisma.product.update({
      where: { id },
      data: { quantityInStock: { increment: input.quantity } },
      include: { category: { select: { name: true } } },
    }),
    prisma.stockMovement.create({
      data: {
        productId: id,
        type: 'RESTOCK',
        quantity: input.quantity,
        reason: input.reason || 'Manual restock',
      },
    }),
  ]);

  return toProductDto(updated);
}

export async function listStockMovements(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw ApiError.notFound('Product not found.');

  return prisma.stockMovement.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listCategoriesPaginated(
  params: PaginationParams,
): Promise<PaginatedResult<{ id: string; name: string; productCount: number }>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const where: Prisma.CategoryWhereInput = search
    ? { name: { contains: search, mode: 'insensitive' } }
    : {};

  const orderBy: Prisma.CategoryOrderByWithRelationInput =
    sortBy === 'productCount' ? { products: { _count: sortDir } } : { name: sortDir ?? 'asc' };

  const [total, categories] = await prisma.$transaction([
    prisma.category.count({ where }),
    prisma.category.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: categories.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products })),
    total,
    page,
    pageSize,
  };
}

export async function listCategories() {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
  return categories.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products }));
}

export async function createCategory(input: CategoryInput) {
  const existing = await prisma.category.findUnique({ where: { name: input.name } });
  if (existing) throw ApiError.conflict('A category with this name already exists.');

  const category = await prisma.category.create({ data: { name: input.name } });
  return { id: category.id, name: category.name, productCount: 0 };
}

export async function updateCategory(id: string, input: CategoryInput) {
  const current = await prisma.category.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('Category not found.');

  if (input.name !== current.name) {
    const existing = await prisma.category.findUnique({ where: { name: input.name } });
    if (existing) throw ApiError.conflict('A category with this name already exists.');
  }

  const category = await prisma.category.update({
    where: { id },
    data: { name: input.name },
    include: { _count: { select: { products: true } } },
  });

  return { id: category.id, name: category.name, productCount: category._count.products };
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw ApiError.notFound('Category not found.');
  if (category._count.products > 0) {
    throw ApiError.badRequest('Cannot delete a category that still has products assigned to it.');
  }

  await prisma.category.delete({ where: { id } });
}

// Used by the sales module inside its own transaction to deduct stock on issue.
export function deductStockInTransaction(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
  reason: string,
) {
  return [
    tx.product.update({
      where: { id: productId },
      data: { quantityInStock: { decrement: quantity } },
    }),
    tx.stockMovement.create({
      data: { productId, type: 'SALE', quantity: -quantity, reason },
    }),
  ];
}
