import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { CategoryInput, ProductInput, RestockInput, SubcategoryInput } from './inventory.validation';

const TAX_RATE = 0.03;

export function toProductDto(product: {
  id: string;
  designNumber: string;
  name: string;
  metalType: string | null;
  grossWeight: Prisma.Decimal | null;
  metalRatePerGram: Prisma.Decimal | null;
  diamondShape: string | null;
  diamondQuality: string | null;
  diamondPieces: number | null;
  diamondCaratWeight: Prisma.Decimal | null;
  diamondRate: Prisma.Decimal | null;
  makingChargePerGram: Prisma.Decimal | null;
  fixedExpense: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  quantityInStock: number;
  reorderLevel: number;
  subcategoryId: string | null;
  subcategory: { name: string; category: { id: string; name: string } } | null;
  createdAt: Date;
}) {
  const grossWeight = product.grossWeight !== null ? Number(product.grossWeight) : null;
  const metalRatePerGram = product.metalRatePerGram !== null ? Number(product.metalRatePerGram) : null;
  const makingChargePerGram = product.makingChargePerGram !== null ? Number(product.makingChargePerGram) : null;
  const diamondCaratWeight = product.diamondCaratWeight !== null ? Number(product.diamondCaratWeight) : null;
  const diamondRate = product.diamondRate !== null ? Number(product.diamondRate) : null;
  const fixedExpense = Number(product.fixedExpense);

  const metalCost = grossWeight !== null && metalRatePerGram !== null
    ? Math.round(grossWeight * metalRatePerGram * 100) / 100
    : 0;
  const labourCost = grossWeight !== null && makingChargePerGram !== null
    ? Math.round(grossWeight * makingChargePerGram * 100) / 100
    : 0;
  const diamondCost = diamondCaratWeight !== null && diamondRate !== null
    ? Math.round(diamondCaratWeight * diamondRate * 100) / 100
    : 0;

  const totalCost = Math.round((metalCost + diamondCost + labourCost + fixedExpense) * 100) / 100;
  const taxAmount = Math.round(totalCost * TAX_RATE * 100) / 100;
  const finalAmount = Math.round((totalCost + taxAmount) * 100) / 100;

  return {
    id: product.id,
    designNumber: product.designNumber,
    name: product.name,
    metalType: product.metalType,
    grossWeight,
    metalRatePerGram,
    metalCost,
    diamondShape: product.diamondShape,
    diamondQuality: product.diamondQuality,
    diamondPieces: product.diamondPieces,
    diamondCaratWeight,
    diamondRate,
    diamondCost,
    makingChargePerGram,
    labourCost,
    fixedExpense,
    totalCost,
    taxAmount,
    finalAmount,
    sellingPrice: Number(product.sellingPrice),
    quantityInStock: product.quantityInStock,
    reorderLevel: product.reorderLevel,
    subcategoryId: product.subcategoryId,
    subcategoryName: product.subcategory?.name ?? null,
    categoryId: product.subcategory?.category.id ?? null,
    categoryName: product.subcategory?.category.name ?? null,
    createdAt: product.createdAt,
  };
}

export const PRODUCT_INCLUDE = {
  subcategory: { include: { category: { select: { id: true, name: true } } } },
} satisfies Prisma.ProductInclude;

export async function listProducts() {
  const products = await prisma.product.findMany({
    include: PRODUCT_INCLUDE,
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
          { designNumber: { contains: search, mode: 'insensitive' } },
          { subcategory: { name: { contains: search, mode: 'insensitive' } } },
          { subcategory: { category: { name: { contains: search, mode: 'insensitive' } } } },
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
    sortBy === 'subcategory'
      ? { subcategory: { name: sortDir } }
      : sortBy === 'name' || sortBy === 'designNumber' || sortBy === 'sellingPrice' || sortBy === 'quantityInStock' || sortBy === 'createdAt'
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

  return { data: products.map(toProductDto), total, page, pageSize };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: PRODUCT_INCLUDE,
  });
  if (!product) throw ApiError.notFound('Product not found.');
  return toProductDto(product);
}

export async function createProduct(input: ProductInput) {
  const existing = await prisma.product.findUnique({ where: { designNumber: input.designNumber } });
  if (existing) throw ApiError.conflict('A product with this design number already exists.');

  const product = await prisma.product.create({
    data: {
      designNumber: input.designNumber,
      name: input.name,
      metalType: input.metalType,
      grossWeight: input.grossWeight,
      metalRatePerGram: input.metalRatePerGram,
      diamondShape: input.diamondShape || null,
      diamondQuality: input.diamondQuality || null,
      diamondPieces: input.diamondPieces ?? null,
      diamondCaratWeight: input.diamondCaratWeight ?? null,
      diamondRate: input.diamondRate ?? null,
      makingChargePerGram: input.makingChargePerGram,
      fixedExpense: input.fixedExpense,
      sellingPrice: input.sellingPrice,
      quantityInStock: input.quantityInStock,
      reorderLevel: input.reorderLevel,
      subcategoryId: input.subcategoryId || null,
    },
    include: PRODUCT_INCLUDE,
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

  if (input.designNumber !== current.designNumber) {
    const existing = await prisma.product.findUnique({ where: { designNumber: input.designNumber } });
    if (existing) throw ApiError.conflict('A product with this design number already exists.');
  }

  await prisma.product.update({
    where: { id },
    data: {
      designNumber: input.designNumber,
      name: input.name,
      metalType: input.metalType,
      grossWeight: input.grossWeight,
      metalRatePerGram: input.metalRatePerGram,
      diamondShape: input.diamondShape || null,
      diamondQuality: input.diamondQuality || null,
      diamondPieces: input.diamondPieces ?? null,
      diamondCaratWeight: input.diamondCaratWeight ?? null,
      diamondRate: input.diamondRate ?? null,
      makingChargePerGram: input.makingChargePerGram,
      fixedExpense: input.fixedExpense,
      sellingPrice: input.sellingPrice,
      reorderLevel: input.reorderLevel,
      subcategoryId: input.subcategoryId || null,
    },
  });

  return getProduct(id);
}

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { _count: { select: { saleItems: true } } },
  });
  if (!product) throw ApiError.notFound('Product not found.');
  if (product._count.saleItems > 0) {
    throw ApiError.badRequest('Cannot delete a product that has been sold.');
  }

  await prisma.$transaction([
    prisma.purchaseItem.deleteMany({ where: { productId: id } }),
    prisma.stockMovement.deleteMany({ where: { productId: id } }),
    prisma.product.delete({ where: { id } }),
  ]);
}

export async function restockProduct(id: string, input: RestockInput) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw ApiError.notFound('Product not found.');

  const [updated] = await prisma.$transaction([
    prisma.product.update({
      where: { id },
      data: { quantityInStock: { increment: input.quantity } },
      include: PRODUCT_INCLUDE,
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
): Promise<PaginatedResult<{ id: string; name: string; subcategoryCount: number }>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const where: Prisma.CategoryWhereInput = search
    ? { name: { contains: search, mode: 'insensitive' } }
    : {};

  const orderBy: Prisma.CategoryOrderByWithRelationInput =
    sortBy === 'subcategoryCount' ? { subcategories: { _count: sortDir } } : { name: sortDir ?? 'asc' };

  const [total, categories] = await prisma.$transaction([
    prisma.category.count({ where }),
    prisma.category.findMany({
      where,
      include: { _count: { select: { subcategories: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: categories.map((c) => ({ id: c.id, name: c.name, subcategoryCount: c._count.subcategories })),
    total,
    page,
    pageSize,
  };
}

export async function listCategories() {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { subcategories: true } } },
    orderBy: { name: 'asc' },
  });
  return categories.map((c) => ({ id: c.id, name: c.name, subcategoryCount: c._count.subcategories }));
}

export async function createCategory(input: CategoryInput) {
  const existing = await prisma.category.findUnique({ where: { name: input.name } });
  if (existing) throw ApiError.conflict('A category with this name already exists.');

  const category = await prisma.category.create({ data: { name: input.name } });
  return { id: category.id, name: category.name, subcategoryCount: 0 };
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
    include: { _count: { select: { subcategories: true } } },
  });

  return { id: category.id, name: category.name, subcategoryCount: category._count.subcategories };
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { subcategories: true } } },
  });
  if (!category) throw ApiError.notFound('Category not found.');
  if (category._count.subcategories > 0) {
    throw ApiError.badRequest('Cannot delete a category that still has subcategories.');
  }

  await prisma.category.delete({ where: { id } });
}

export async function listSubcategoriesPaginated(
  params: PaginationParams,
  categoryId?: string,
): Promise<PaginatedResult<{ id: string; name: string; categoryId: string; categoryName: string; productCount: number }>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const searchFilter: Prisma.SubcategoryWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { category: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }
    : {};

  const where: Prisma.SubcategoryWhereInput = categoryId ? { AND: [searchFilter, { categoryId }] } : searchFilter;

  const orderBy: Prisma.SubcategoryOrderByWithRelationInput =
    sortBy === 'category'
      ? { category: { name: sortDir } }
      : sortBy === 'productCount'
        ? { products: { _count: sortDir } }
        : { name: sortDir ?? 'asc' };

  const [total, subcategories] = await prisma.$transaction([
    prisma.subcategory.count({ where }),
    prisma.subcategory.findMany({
      where,
      include: { category: { select: { name: true } }, _count: { select: { products: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: subcategories.map((s) => ({
      id: s.id,
      name: s.name,
      categoryId: s.categoryId,
      categoryName: s.category.name,
      productCount: s._count.products,
    })),
    total,
    page,
    pageSize,
  };
}

export async function listSubcategories(categoryId?: string) {
  const subcategories = await prisma.subcategory.findMany({
    where: categoryId ? { categoryId } : undefined,
    include: { category: { select: { name: true } }, _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
  return subcategories.map((s) => ({
    id: s.id,
    name: s.name,
    categoryId: s.categoryId,
    categoryName: s.category.name,
    productCount: s._count.products,
  }));
}

export async function createSubcategory(input: SubcategoryInput) {
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw ApiError.notFound('Category not found.');

  const existing = await prisma.subcategory.findUnique({
    where: { categoryId_name: { categoryId: input.categoryId, name: input.name } },
  });
  if (existing) throw ApiError.conflict('A subcategory with this name already exists in this category.');

  const subcategory = await prisma.subcategory.create({
    data: { name: input.name, categoryId: input.categoryId },
  });
  return { id: subcategory.id, name: subcategory.name, categoryId: subcategory.categoryId, categoryName: category.name, productCount: 0 };
}

export async function updateSubcategory(id: string, input: SubcategoryInput) {
  const current = await prisma.subcategory.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('Subcategory not found.');

  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw ApiError.notFound('Category not found.');

  if (input.name !== current.name || input.categoryId !== current.categoryId) {
    const existing = await prisma.subcategory.findUnique({
      where: { categoryId_name: { categoryId: input.categoryId, name: input.name } },
    });
    if (existing) throw ApiError.conflict('A subcategory with this name already exists in this category.');
  }

  const subcategory = await prisma.subcategory.update({
    where: { id },
    data: { name: input.name, categoryId: input.categoryId },
    include: { _count: { select: { products: true } } },
  });

  return {
    id: subcategory.id,
    name: subcategory.name,
    categoryId: subcategory.categoryId,
    categoryName: category.name,
    productCount: subcategory._count.products,
  };
}

export async function deleteSubcategory(id: string) {
  const subcategory = await prisma.subcategory.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!subcategory) throw ApiError.notFound('Subcategory not found.');
  if (subcategory._count.products > 0) {
    throw ApiError.badRequest('Cannot delete a subcategory that still has products assigned to it.');
  }
  const enquiryCount = await prisma.enquiry.count({ where: { subcategoryId: id } });
  if (enquiryCount > 0) {
    throw ApiError.badRequest('Cannot delete a subcategory that still has enquiries assigned to it.');
  }

  await prisma.subcategory.delete({ where: { id } });
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
