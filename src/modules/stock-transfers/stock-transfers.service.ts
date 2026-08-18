import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { checkLowStock } from '@/modules/inventory/inventory.service';
import type { CreateTransferInput } from './stock-transfers.validation';

const TRANSFER_INCLUDE = {
  product: { select: { name: true, sku: true } },
  fromWarehouse: { select: { name: true } },
  toWarehouse: { select: { name: true } },
} satisfies Prisma.StockTransferInclude;

type StockTransferWithRelations = Prisma.StockTransferGetPayload<{ include: typeof TRANSFER_INCLUDE }>;

function toDto(transfer: StockTransferWithRelations) {
  return {
    id: transfer.id,
    productId: transfer.productId,
    productName: transfer.product.name,
    sku: transfer.product.sku,
    quantity: transfer.quantity,
    fromWarehouseId: transfer.fromWarehouseId,
    fromWarehouseName: transfer.fromWarehouse.name,
    toWarehouseId: transfer.toWarehouseId,
    toWarehouseName: transfer.toWarehouse.name,
    createdAt: transfer.createdAt,
  };
}

export async function listTransfers() {
  const transfers = await prisma.stockTransfer.findMany({
    include: TRANSFER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return transfers.map(toDto);
}

export async function createTransfer(input: CreateTransferInput) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw ApiError.notFound('Product not found.');

  const fromWarehouse = await prisma.warehouse.findUnique({ where: { id: input.fromWarehouseId } });
  if (!fromWarehouse) throw ApiError.notFound('Source warehouse not found.');

  const toWarehouse = await prisma.warehouse.findUnique({ where: { id: input.toWarehouseId } });
  if (!toWarehouse) throw ApiError.notFound('Destination warehouse not found.');

  const transferId = await prisma.$transaction(
    async (tx) => {
      const decremented = await tx.productStock.updateMany({
        where: { productId: input.productId, warehouseId: input.fromWarehouseId, quantity: { gte: input.quantity } },
        data: { quantity: { decrement: input.quantity } },
      });
      if (decremented.count === 0) {
        throw ApiError.badRequest('Not enough stock to transfer.');
      }

      await tx.productStock.upsert({
        where: { productId_warehouseId: { productId: input.productId, warehouseId: input.toWarehouseId } },
        update: { quantity: { increment: input.quantity } },
        create: { productId: input.productId, warehouseId: input.toWarehouseId, quantity: input.quantity },
      });

      await tx.stockMovement.create({
        data: {
          productId: input.productId,
          warehouseId: input.fromWarehouseId,
          type: 'ADJUSTMENT',
          quantity: -input.quantity,
          reason: `Transfer to ${toWarehouse.name}`,
        },
      });
      await tx.stockMovement.create({
        data: {
          productId: input.productId,
          warehouseId: input.toWarehouseId,
          type: 'ADJUSTMENT',
          quantity: input.quantity,
          reason: `Transfer from ${fromWarehouse.name}`,
        },
      });

      const created = await tx.stockTransfer.create({
        data: {
          productId: input.productId,
          quantity: input.quantity,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
        },
      });

      return created.id;
    },
    { timeout: 30000, maxWait: 30000 },
  );

  const transfer = await prisma.stockTransfer.findUniqueOrThrow({
    where: { id: transferId },
    include: TRANSFER_INCLUDE,
  });

  await checkLowStock(input.productId, input.fromWarehouseId);

  return toDto(transfer);
}
