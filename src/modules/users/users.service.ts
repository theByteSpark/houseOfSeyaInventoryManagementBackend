import bcrypt from 'bcrypt';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { createNotification } from '@/modules/notifications/notifications.service';
import type { CreateUserInput, UpdateUserInput } from './users.validation';

const SALT_ROUNDS = 10;
const WAREHOUSE_SCOPED_ROLES = new Set(['USER', 'ADMIN']);

function toUserDto(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  warehouseMapping: { warehouseId: string; warehouse: { name: string } } | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    warehouseId: user.warehouseMapping?.warehouseId ?? null,
    warehouseName: user.warehouseMapping?.warehouse.name ?? null,
    createdAt: user.createdAt,
  };
}

const USER_INCLUDE = {
  warehouseMapping: { include: { warehouse: { select: { name: true } } } },
} as const;

export async function listUsers() {
  const users = await prisma.user.findMany({
    include: USER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return users.map(toUserDto);
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict('A user with this email already exists.');

  const role = input.role ?? 'USER';
  if (input.warehouseId) {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw ApiError.notFound('Warehouse not found.');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role,
      ...(input.warehouseId
        ? { warehouseMapping: { create: { warehouseId: input.warehouseId } } }
        : {}),
    },
    include: USER_INCLUDE,
  });

  await createNotification({
    warehouseId: null,
    type: 'SYSTEM',
    title: 'User created',
    message: `${user.name} (${user.email}) was added as ${role}.`,
    metadata: { userId: user.id },
  });

  return toUserDto(user);
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
  if (!user) throw ApiError.notFound('User not found.');
  return toUserDto(user);
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const current = await prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
  if (!current) throw ApiError.notFound('User not found.');

  const nextRole = input.role ?? current.role;

  if (input.warehouseId) {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw ApiError.notFound('Warehouse not found.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { ...(input.name ? { name: input.name } : {}), ...(input.role ? { role: input.role } : {}) },
    });

    if (WAREHOUSE_SCOPED_ROLES.has(nextRole) && input.warehouseId) {
      await tx.userWarehouse.upsert({
        where: { userId: id },
        update: { warehouseId: input.warehouseId },
        create: { userId: id, warehouseId: input.warehouseId },
      });
    } else if (!WAREHOUSE_SCOPED_ROLES.has(nextRole)) {
      await tx.userWarehouse.deleteMany({ where: { userId: id } });
    }
  });

  return getUser(id);
}

export async function deleteUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('User not found.');

  await prisma.$transaction([
    prisma.userWarehouse.deleteMany({ where: { userId: id } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
    prisma.notificationRead.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);
}
