import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import { createNotification } from '@/modules/notifications/notifications.service';
import type { WarehouseInput } from './warehouses.validation';

function toDto(warehouse: { id: string; name: string; code: string | null; address: string | null; isActive: boolean; createdAt: Date }) {
  return {
    id: warehouse.id,
    name: warehouse.name,
    code: warehouse.code,
    address: warehouse.address,
    isActive: warehouse.isActive,
    createdAt: warehouse.createdAt,
  };
}

export async function listWarehouses() {
  const warehouses = await prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  return warehouses.map(toDto);
}

export async function listWarehousesPaginated(
  params: PaginationParams,
): Promise<PaginatedResult<ReturnType<typeof toDto>>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const where: Prisma.WarehouseWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const orderBy: Prisma.WarehouseOrderByWithRelationInput =
    sortBy === 'name' || sortBy === 'code' || sortBy === 'isActive' || sortBy === 'createdAt'
      ? { [sortBy]: sortDir }
      : { name: 'asc' };

  const [total, warehouses] = await prisma.$transaction([
    prisma.warehouse.count({ where }),
    prisma.warehouse.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
  ]);

  return { data: warehouses.map(toDto), total, page, pageSize };
}

export async function getWarehouse(id: string) {
  const warehouse = await prisma.warehouse.findUnique({ where: { id } });
  if (!warehouse) throw ApiError.notFound('Warehouse not found.');
  return toDto(warehouse);
}

export async function createWarehouse(input: WarehouseInput) {
  const existing = await prisma.warehouse.findUnique({ where: { name: input.name } });
  if (existing) throw ApiError.conflict('A warehouse with this name already exists.');

  const warehouse = await prisma.warehouse.create({
    data: {
      name: input.name,
      code: input.code || null,
      address: input.address || null,
      isActive: input.isActive ?? true,
    },
  });

  await createNotification({
    warehouseId: null,
    type: 'SYSTEM',
    title: 'Warehouse added',
    message: `${warehouse.name} was added as a new warehouse.`,
    metadata: { warehouseId: warehouse.id },
  });

  return toDto(warehouse);
}

export async function updateWarehouse(id: string, input: WarehouseInput) {
  const current = await prisma.warehouse.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('Warehouse not found.');

  if (input.name !== current.name) {
    const existing = await prisma.warehouse.findUnique({ where: { name: input.name } });
    if (existing) throw ApiError.conflict('A warehouse with this name already exists.');
  }

  const warehouse = await prisma.warehouse.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code || null,
      address: input.address || null,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
  });
  return toDto(warehouse);
}

export async function deleteWarehouse(id: string) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    include: { _count: { select: { userMappings: true, stocks: true } } },
  });
  if (!warehouse) throw ApiError.notFound('Warehouse not found.');
  if (warehouse._count.userMappings > 0 || warehouse._count.stocks > 0) {
    throw ApiError.badRequest('Cannot delete a warehouse that has assigned users or stock records.');
  }

  await prisma.warehouse.delete({ where: { id } });
}
