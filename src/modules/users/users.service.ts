import bcrypt from 'bcrypt';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { CreateUserInput, UpdateUserInput } from './users.validation';

const SALT_ROUNDS = 10;
const PUBLIC_USER_SELECT = { id: true, name: true, email: true, role: true, createdAt: true } as const;

export async function listUsers() {
  return prisma.user.findMany({ select: PUBLIC_USER_SELECT, orderBy: { createdAt: 'desc' } });
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict('A user with this email already exists.');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role ?? 'STAFF',
    },
    select: PUBLIC_USER_SELECT,
  });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });
  if (!user) throw ApiError.notFound('User not found.');
  return user;
}

export async function updateUser(id: string, input: UpdateUserInput) {
  await getUser(id);
  return prisma.user.update({ where: { id }, data: input, select: PUBLIC_USER_SELECT });
}

export async function deleteUser(id: string) {
  await getUser(id);
  await prisma.user.delete({ where: { id } });
}
