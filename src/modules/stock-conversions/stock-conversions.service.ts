import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { isCompanyLevel, requireWarehouseId } from '@/utils/warehouseScope';
import { checkLowStock } from '@/modules/inventory/inventory.service';
import type { CreateConversionInput } from './stock-conversions.validation';

const CONVERSION_INCLUDE = {
  fromProduct: { select: { name: true, sku: true } },
  toProduct: { select: { name: true, sku: true } },
  warehouse: { select: { name: true } },
} satisfies Prisma.StockConversionInclude;

type StockConversionWithRelations = Prisma.StockConversionGetPayload<{ include: typeof CONVERSION_INCLUDE }>;

function toDto(conversion: StockConversionWithRelations) {
  return {
    id: conversion.id,
    fromProductId: conversion.fromProductId,
    fromProductName: conversion.fromProduct.name,
    fromSku: conversion.fromProduct.sku,
    toProductId: conversion.toProductId,
    toProductName: conversion.toProduct.name,
    toSku: conversion.toProduct.sku,
    warehouseId: conversion.warehouseId,
    warehouseName: conversion.warehouse.name,
    quantity: conversion.quantity,
    createdAt: conversion.createdAt,
  };
}

export async function listConversions(user: AuthenticatedUser) {
  const where: Prisma.StockConversionWhereInput = isCompanyLevel(user)
    ? {}
    : { warehouseId: user.warehouseId ?? '__none__' };

  const conversions = await prisma.stockConversion.findMany({
    where,
    include: CONVERSION_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return conversions.map(toDto);
}

export async function createConversion(user: AuthenticatedUser, input: CreateConversionInput) {
  const warehouseId = requireWarehouseId(user, input.warehouseId);

  const fromProduct = await prisma.product.findUnique({ where: { id: input.fromProductId } });
  if (!fromProduct) throw ApiError.notFound('Source product not found.');

  const toProduct = await prisma.product.findUnique({ where: { id: input.toProductId } });
  if (!toProduct) throw ApiError.notFound('Destination product not found.');

  const conversionId = await prisma.$transaction(
    async (tx) => {
      const decremented = await tx.productStock.updateMany({
        where: { productId: input.fromProductId, warehouseId, quantity: { gte: input.quantity } },
        data: { quantity: { decrement: input.quantity } },
      });
      if (decremented.count === 0) {
        throw ApiError.badRequest('Not enough stock to convert.');
      }

      await tx.productStock.upsert({
        where: { productId_warehouseId: { productId: input.toProductId, warehouseId } },
        update: { quantity: { increment: input.quantity } },
        create: { productId: input.toProductId, warehouseId, quantity: input.quantity },
      });

      await tx.stockMovement.create({
        data: {
          productId: input.fromProductId,
          warehouseId,
          type: 'ADJUSTMENT',
          quantity: -input.quantity,
          reason: `Converted to ${toProduct.name}`,
        },
      });
      await tx.stockMovement.create({
        data: {
          productId: input.toProductId,
          warehouseId,
          type: 'ADJUSTMENT',
          quantity: input.quantity,
          reason: `Converted from ${fromProduct.name}`,
        },
      });

      const created = await tx.stockConversion.create({
        data: {
          fromProductId: input.fromProductId,
          toProductId: input.toProductId,
          warehouseId,
          quantity: input.quantity,
        },
      });

      return created.id;
    },
    { timeout: 30000, maxWait: 30000 },
  );

  const conversion = await prisma.stockConversion.findUniqueOrThrow({
    where: { id: conversionId },
    include: CONVERSION_INCLUDE,
  });

  await checkLowStock(input.fromProductId, warehouseId);

  return toDto(conversion);
}
