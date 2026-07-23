import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { CustomerInput } from './customers.validation';

function toDto(customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; createdAt: Date; _count: { sales: number } }) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    totalSales: customer._count.sales,
    createdAt: customer.createdAt,
  };
}

export async function listCustomers() {
  const customers = await prisma.customer.findMany({
    include: { _count: { select: { sales: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return customers.map(toDto);
}

export async function listCustomersPaginated(params: PaginationParams): Promise<PaginatedResult<ReturnType<typeof toDto>>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const where: Prisma.CustomerWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    sortBy === 'totalSales'
      ? { sales: { _count: sortDir } }
      : sortBy === 'name' || sortBy === 'email' || sortBy === 'phone' || sortBy === 'createdAt'
        ? { [sortBy]: sortDir }
        : { createdAt: 'desc' };

  const [total, customers] = await prisma.$transaction([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: { _count: { select: { sales: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: customers.map(toDto), total, page, pageSize };
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { sales: true } } },
  });
  if (!customer) throw ApiError.notFound('Customer not found.');
  return toDto(customer);
}

export async function createCustomer(input: CustomerInput) {
  const customer = await prisma.customer.create({
    data: {
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
    },
    include: { _count: { select: { sales: true } } },
  });
  return toDto(customer);
}

export async function updateCustomer(id: string, input: CustomerInput) {
  await getCustomer(id);
  const customer = await prisma.customer.update({
    where: { id },
    data: {
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
    },
    include: { _count: { select: { sales: true } } },
  });
  return toDto(customer);
}

export async function deleteCustomer(id: string) {
  await getCustomer(id);
  await prisma.customer.delete({ where: { id } });
}
