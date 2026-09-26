import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { isCompanyLevel, requireWarehouseId } from '@/utils/warehouseScope';
import { createSale } from '@/modules/sales/sales.service';
import type {
  CreateBlockedQuantityInput,
  EditBlockedQuantityInput,
  ConfirmBlockedQuantityInput,
} from './blocked-quantity.validation';

const BLOCKED_QUANTITY_INCLUDE = {
  product: { select: { name: true, sku: true } },
  warehouse: { select: { name: true } },
} satisfies Prisma.BlockedQuantityInclude;

type BlockedQuantityWithRelations = Prisma.BlockedQuantityGetPayload<{ include: typeof BLOCKED_QUANTITY_INCLUDE }>;

function toDto(blocked: BlockedQuantityWithRelations) {
  return {
    id: blocked.id,
    productId: blocked.productId,
    productName: blocked.product.name,
    sku: blocked.product.sku,
    warehouseId: blocked.warehouseId,
    warehouseName: blocked.warehouse.name,
    quantity: blocked.quantity,
    status: blocked.status,
    saleId: blocked.saleId,
    createdAt: blocked.createdAt,
  };
}

// Warehouse-scoped roles (USER/ADMIN) are always locked to their own warehouse.
// Company-level roles see everything by default, but may narrow to one
// warehouse via the optional `warehouseId` filter param.
function scopeWarehouseWhere(user: AuthenticatedUser, warehouseId?: string): Prisma.BlockedQuantityWhereInput {
  if (!isCompanyLevel(user)) return { warehouseId: user.warehouseId ?? '__none__' };
  return warehouseId ? { warehouseId } : {};
}

export async function listBlockedQuantities(
  user: AuthenticatedUser,
  statusFilter?: 'OPEN' | 'CONFIRMED' | 'CANCELLED' | 'ALL',
  warehouseId?: string,
  productId?: string,
) {
  const where: Prisma.BlockedQuantityWhereInput = {
    AND: [
      scopeWarehouseWhere(user, warehouseId),
      !statusFilter || statusFilter === 'OPEN'
        ? { status: 'OPEN' as const }
        : statusFilter === 'ALL'
          ? {}
          : { status: statusFilter },
      ...(productId ? [{ productId }] : []),
    ],
  };

  const rows = await prisma.blockedQuantity.findMany({
    where,
    include: BLOCKED_QUANTITY_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDto);
}

// Returns how much of a product's stock at a warehouse is still free to
// block: current stock minus what other OPEN blocks already claim.
async function getAvailableToBlock(productId: string, warehouseId: string, excludeBlockedQuantityId?: string) {
  const stock = await prisma.productStock.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  const inStock = stock?.quantity ?? 0;

  const openBlocks = await prisma.blockedQuantity.aggregate({
    where: {
      productId,
      warehouseId,
      status: 'OPEN',
      ...(excludeBlockedQuantityId ? { id: { not: excludeBlockedQuantityId } } : {}),
    },
    _sum: { quantity: true },
  });
  const alreadyBlocked = openBlocks._sum.quantity ?? 0;

  return inStock - alreadyBlocked;
}

// A product+warehouse should only ever have one OPEN blocked-quantity row.
// If one already exists, blocking more just increments it instead of
// creating a second row.
export async function createBlockedQuantity(user: AuthenticatedUser, input: CreateBlockedQuantityInput) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw ApiError.notFound('Product not found.');

  const warehouseId = requireWarehouseId(user, input.warehouseId);

  const available = await getAvailableToBlock(input.productId, warehouseId);
  if (input.quantity > available) {
    throw ApiError.badRequest(`Only ${Math.max(available, 0)} units are available to block for ${product.name}.`);
  }

  const existingOpen = await prisma.blockedQuantity.findFirst({
    where: { productId: input.productId, warehouseId, status: 'OPEN' },
  });

  const blocked = existingOpen
    ? await prisma.blockedQuantity.update({
        where: { id: existingOpen.id },
        data: { quantity: { increment: input.quantity } },
        include: BLOCKED_QUANTITY_INCLUDE,
      })
    : await prisma.blockedQuantity.create({
        data: { productId: input.productId, warehouseId, quantity: input.quantity },
        include: BLOCKED_QUANTITY_INCLUDE,
      });

  return toDto(blocked);
}

export async function editBlockedQuantity(user: AuthenticatedUser, id: string, input: EditBlockedQuantityInput) {
  const existing = await prisma.blockedQuantity.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!existing) throw ApiError.notFound('Blocked quantity not found.');
  if (existing.status !== 'OPEN') throw ApiError.badRequest('Only an open blocked quantity can be edited.');

  const available = await getAvailableToBlock(existing.productId, existing.warehouseId, existing.id);
  if (input.additionalQuantity > available) {
    throw ApiError.badRequest(`Only ${Math.max(available, 0)} additional units are available to block.`);
  }

  const updated = await prisma.blockedQuantity.update({
    where: { id },
    data: { quantity: { increment: input.additionalQuantity } },
    include: BLOCKED_QUANTITY_INCLUDE,
  });
  return toDto(updated);
}

export async function deleteBlockedQuantity(user: AuthenticatedUser, id: string) {
  const existing = await prisma.blockedQuantity.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!existing) throw ApiError.notFound('Blocked quantity not found.');
  if (existing.status !== 'OPEN') throw ApiError.badRequest('Only an open blocked quantity can be deleted.');

  await prisma.blockedQuantity.delete({ where: { id } });
}

// Confirming a block registers the full blocked quantity as a real sale,
// reusing the sales module's own creation path so tax, stock checks, stock
// decrement, sale numbering and notifications all stay in one place rather
// than being re-implemented here. A block never reserves real stock itself
// (it's advisory, same as an Enquiry), so this is the only point at which
// stock actually moves.
export async function confirmBlockedQuantity(user: AuthenticatedUser, id: string, input: ConfirmBlockedQuantityInput) {
  const blocked = await prisma.blockedQuantity.findFirst({ where: { id, ...scopeWarehouseWhere(user) } });
  if (!blocked) throw ApiError.notFound('Blocked quantity not found.');
  if (blocked.status !== 'OPEN') throw ApiError.badRequest('Blocked quantity is already confirmed or cancelled.');

  const sale = await createSale(user, {
    customerId: input.customerId,
    warehouseId: blocked.warehouseId,
    items: [{ productId: blocked.productId, quantity: blocked.quantity, unitPrice: input.unitPrice }],
  });

  await prisma.blockedQuantity.update({
    where: { id },
    data: { status: 'CONFIRMED', saleId: sale.id },
  });

  return sale;
}
