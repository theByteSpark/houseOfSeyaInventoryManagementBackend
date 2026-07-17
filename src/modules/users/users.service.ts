import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { UpdateUserInput } from './users.validation';

const PUBLIC_USER_SELECT = { id: true, name: true, email: true, role: true, createdAt: true } as const;

export async function listUsers() {
  return prisma.user.findMany({ select: PUBLIC_USER_SELECT, orderBy: { createdAt: 'desc' } });
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
