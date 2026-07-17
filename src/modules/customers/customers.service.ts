import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { CustomerInput } from './customers.validation';

function toDto(customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; createdAt: Date; _count: { invoices: number } }) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    totalInvoices: customer._count.invoices,
    createdAt: customer.createdAt,
  };
}

export async function listCustomers() {
  const customers = await prisma.customer.findMany({
    include: { _count: { select: { invoices: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return customers.map(toDto);
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { invoices: true } } },
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
    include: { _count: { select: { invoices: true } } },
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
    include: { _count: { select: { invoices: true } } },
  });
  return toDto(customer);
}

export async function deleteCustomer(id: string) {
  await getCustomer(id);
  await prisma.customer.delete({ where: { id } });
}
