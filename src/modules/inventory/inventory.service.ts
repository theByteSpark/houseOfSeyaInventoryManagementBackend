import { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { isCompanyLevel, requireWarehouseId } from '@/utils/warehouseScope';
import { createNotification } from '@/modules/notifications/notifications.service';
import type { CategoryInput, ProductInput, RestockInput } from './inventory.validation';

// Derives a SKU from the product name (e.g. "Cotton Poplin — Ivory" ->
// "COTTON-POPLIN-IVORY") since the UI no longer collects one directly.
// Appends a numeric suffix on collision to keep the field unique.
async function generateUniqueSku(name: string): Promise<string> {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'PRODUCT';

  let candidate = base;
  let suffix = 1;
  while (await prisma.product.findUnique({ where: { sku: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

// Fires a LOW_STOCK notification if the product's stock at this warehouse is
// now at or below its reorder level. Best-effort — never blocks the caller.
export async function checkLowStock(productId: string, warehouseId: string) {
  try {
    const [product, stock] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId }, select: { name: true, sku: true, reorderLevel: true } }),
      prisma.productStock.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } }),
    ]);
    if (!product || !stock) return;

    const threshold = stock.reorderLevel ?? product.reorderLevel;
    if (stock.quantity > threshold) return;

    await createNotification({
      warehouseId,
      type: 'LOW_STOCK',
      title: 'Low stock',
      message: `${product.name} (${product.sku}) is at ${stock.quantity}, at or below its reorder level of ${threshold}.`,
      metadata: { productId, warehouseId, quantity: stock.quantity, reorderLevel: threshold },
    });
  } catch (err) {
    console.error('checkLowStock failed', err);
  }
}

type ProductWithRelations = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  reorderLevel: number;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  stocks: { warehouseId: string; quantity: number; warehouse: { name: string } }[];
  createdAt: Date;
};

function toProductDto(product: ProductWithRelations, viewerWarehouseId: string | null) {
  const totalQuantity = product.stocks.reduce((sum, s) => sum + s.quantity, 0);
  const viewerStock = viewerWarehouseId
    ? product.stocks.find((s) => s.warehouseId === viewerWarehouseId)
    : undefined;

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    reorderLevel: product.reorderLevel,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    // Quantity at the viewer's own warehouse when scoped; total across all warehouses otherwise.
    quantityInStock: viewerWarehouseId ? (viewerStock?.quantity ?? 0) : totalQuantity,
    stockByWarehouse: product.stocks.map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      quantity: s.quantity,
    })),
    createdAt: product.createdAt,
  };
}

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true } },
  stocks: { include: { warehouse: { select: { name: true } } } },
} satisfies Prisma.ProductInclude;

// Warehouse-scoped roles always see their own warehouse. Company-level roles
// see the total across all warehouses unless they explicitly pick one (e.g.
// via the header warehouse selector), in which case that selection wins.
function scopeWarehouseId(user: AuthenticatedUser, explicitWarehouseId?: string): string | null {
  if (isCompanyLevel(user)) return explicitWarehouseId ?? null;
  return user.warehouseId;
}

export async function listProducts(user: AuthenticatedUser, warehouseId?: string) {
  const products = await prisma.product.findMany({
    include: PRODUCT_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return products.map((p) => toProductDto(p, scopeWarehouseId(user, warehouseId)));
}

export async function listProductsPaginated(
  user: AuthenticatedUser,
  params: PaginationParams,
  stockFilter: 'all' | 'low',
  warehouseId?: string,
): Promise<PaginatedResult<ReturnType<typeof toProductDto>>> {
  const { page, pageSize, search, sortBy, sortDir } = params;
  const viewerWarehouseId = scopeWarehouseId(user, warehouseId);

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
          await prisma.$queryRaw<{ id: string }[]>`
            SELECT DISTINCT p."id" FROM "Product" p
            JOIN "ProductStock" ps ON ps."productId" = p."id"
            WHERE ps."quantity" <= COALESCE(ps."reorderLevel", p."reorderLevel")
            ${viewerWarehouseId ? Prisma.sql`AND ps."warehouseId" = ${viewerWarehouseId}` : Prisma.empty}
          `
        ).map((row) => row.id)
      : null;

  const where: Prisma.ProductWhereInput =
    lowStockIds !== null ? { AND: [searchFilter, { id: { in: lowStockIds } }] } : searchFilter;

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sortBy === 'category'
      ? { category: { name: sortDir } }
      : sortBy === 'name' || sortBy === 'sku' || sortBy === 'createdAt'
        ? { [sortBy]: sortDir }
        : { createdAt: 'desc' };

  const [total, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: products.map((p) => toProductDto(p, viewerWarehouseId)), total, page, pageSize };
}

export async function getProduct(user: AuthenticatedUser, id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: PRODUCT_INCLUDE,
  });
  if (!product) throw ApiError.notFound('Product not found.');
  return toProductDto(product, scopeWarehouseId(user));
}

export async function createProduct(user: AuthenticatedUser, input: ProductInput) {
  let sku = input.sku;
  if (sku) {
    const existing = await prisma.product.findUnique({ where: { sku } });
    if (existing) throw ApiError.conflict('A product with this SKU already exists.');
  } else {
    sku = await generateUniqueSku(input.name);
  }

  const product = await prisma.product.create({
    data: {
      sku,
      name: input.name,
      description: input.description || null,
      reorderLevel: input.reorderLevel,
      categoryId: input.categoryId || null,
    },
    include: PRODUCT_INCLUDE,
  });

  if (input.quantityInStock && input.quantityInStock > 0) {
    const warehouseId = requireWarehouseId(user, input.warehouseId);
    await prisma.$transaction([
      prisma.productStock.create({
        data: { productId: product.id, warehouseId, quantity: input.quantityInStock },
      }),
      prisma.stockMovement.create({
        data: {
          productId: product.id,
          warehouseId,
          type: 'RESTOCK',
          quantity: input.quantityInStock,
          reason: 'Initial stock',
        },
      }),
    ]);
  }

  return getProduct(user, product.id);
}

export async function updateProduct(user: AuthenticatedUser, id: string, input: ProductInput) {
  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('Product not found.');

  let sku = current.sku;
  if (input.sku && input.sku !== current.sku) {
    const existing = await prisma.product.findUnique({ where: { sku: input.sku } });
    if (existing) throw ApiError.conflict('A product with this SKU already exists.');
    sku = input.sku;
  }

  await prisma.product.update({
    where: { id },
    data: {
      sku,
      name: input.name,
      description: input.description || null,
      reorderLevel: input.reorderLevel,
      categoryId: input.categoryId || null,
    },
  });

  return getProduct(user, id);
}

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          saleItems: { where: { sale: { status: { not: 'CANCELLED' } } } },
          purchaseItems: { where: { purchase: { status: { not: 'CANCELLED' } } } },
          enquiries: true,
        },
      },
    },
  });
  if (!product) throw ApiError.notFound('Product not found.');
  const { saleItems, purchaseItems, enquiries } = product._count;
  if (saleItems > 0 || purchaseItems > 0 || enquiries > 0) {
    throw ApiError.badRequest(
      'Cannot delete a product that has active sales, purchases, or enquiries linked to it.',
    );
  }
  await prisma.$transaction([
    prisma.saleItem.deleteMany({ where: { productId: id, sale: { status: 'CANCELLED' } } }),
    prisma.purchaseItem.deleteMany({ where: { productId: id, purchase: { status: 'CANCELLED' } } }),
    prisma.stockMovement.deleteMany({ where: { productId: id } }),
    prisma.productStock.deleteMany({ where: { productId: id } }),
    prisma.product.delete({ where: { id } }),
  ]);
}

export async function restockProduct(user: AuthenticatedUser, id: string, input: RestockInput) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw ApiError.notFound('Product not found.');

  const warehouseId = requireWarehouseId(user, input.warehouseId);

  await prisma.$transaction([
    prisma.productStock.upsert({
      where: { productId_warehouseId: { productId: id, warehouseId } },
      update: { quantity: { increment: input.quantity } },
      create: { productId: id, warehouseId, quantity: input.quantity },
    }),
    prisma.stockMovement.create({
      data: {
        productId: id,
        warehouseId,
        type: 'RESTOCK',
        quantity: input.quantity,
        reason: input.reason || 'Manual restock',
      },
    }),
  ]);

  await checkLowStock(id, warehouseId);

  return getProduct(user, id);
}

export async function listStockMovements(user: AuthenticatedUser, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw ApiError.notFound('Product not found.');

  const warehouseId = scopeWarehouseId(user);

  return prisma.stockMovement.findMany({
    where: { productId, ...(warehouseId ? { warehouseId } : {}) },
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
  warehouseId: string,
  quantity: number,
  reason: string,
) {
  return [
    tx.productStock.update({
      where: { productId_warehouseId: { productId, warehouseId } },
      data: { quantity: { decrement: quantity } },
    }),
    tx.stockMovement.create({
      data: { productId, warehouseId, type: 'SALE', quantity: -quantity, reason },
    }),
  ];
}

// Used by the purchases module inside its own transaction to add stock on receive.
export function addStockInTransaction(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
  quantity: number,
  reason: string,
) {
  return [
    tx.productStock.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      update: { quantity: { increment: quantity } },
      create: { productId, warehouseId, quantity },
    }),
    tx.stockMovement.create({
      data: { productId, warehouseId, type: 'RESTOCK', quantity, reason },
    }),
  ];
}

export async function getProductStockAtWarehouse(productId: string, warehouseId: string): Promise<number> {
  const stock = await prisma.productStock.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  return stock?.quantity ?? 0;
}
