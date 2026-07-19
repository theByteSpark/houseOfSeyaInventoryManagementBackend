import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
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

// Used by the invoices module inside its own transaction to deduct stock on issue.
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
