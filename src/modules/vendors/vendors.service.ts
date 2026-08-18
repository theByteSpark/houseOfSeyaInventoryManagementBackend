import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { VendorInput } from './vendors.validation';

const VENDOR_INCLUDE = {
  purchases: {
    select: {
      id: true,
      purchaseNumber: true,
      status: true,
      orderedAt: true,
      createdAt: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          product: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.VendorInclude;

type VendorWithRelations = Prisma.VendorGetPayload<{ include: typeof VENDOR_INCLUDE }>;

function toDto(vendor: VendorWithRelations) {
  const orderedPurchases = vendor.purchases.filter((p) => p.orderedAt !== null);
  const lastPurchase = orderedPurchases.length > 0 ? orderedPurchases[0] : null;
  const lastItem = lastPurchase?.items[0];

  return {
    id: vendor.id,
    companyName: vendor.companyName,
    contactPerson: vendor.contactPerson,
    email: vendor.email,
    phone: vendor.phone,
    address: vendor.address,
    totalOrders: vendor.purchases.length,
    lastOrderedDate: lastPurchase?.orderedAt ?? null,
    lastOrderedProduct: lastItem?.product.name ?? null,
    lastOrderedQty: lastItem?.quantity ?? null,
    createdAt: vendor.createdAt,
  };
}

export async function listVendors() {
  const vendors = await prisma.vendor.findMany({
    include: VENDOR_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return vendors.map(toDto);
}

export async function listVendorsPaginated(
  params: PaginationParams,
): Promise<PaginatedResult<ReturnType<typeof toDto>>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  // Vendors are global master data, not warehouse-scoped — a vendor with no
  // purchases yet in a given warehouse must still be visible there.
  const where: Prisma.VendorWhereInput = search
    ? {
        OR: [
          { companyName: { contains: search, mode: 'insensitive' } },
          { contactPerson: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const orderBy: Prisma.VendorOrderByWithRelationInput =
    sortBy === 'totalOrders'
      ? { purchases: { _count: sortDir } }
      : sortBy === 'companyName' || sortBy === 'contactPerson' || sortBy === 'email' || sortBy === 'phone' || sortBy === 'createdAt'
        ? { [sortBy]: sortDir }
        : { createdAt: 'desc' };

  const [total, vendors] = await prisma.$transaction([
    prisma.vendor.count({ where }),
    prisma.vendor.findMany({
      where,
      include: VENDOR_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: vendors.map(toDto), total, page, pageSize };
}

export async function getVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: VENDOR_INCLUDE,
  });
  if (!vendor) throw ApiError.notFound('Vendor not found.');
  return toDto(vendor);
}

export async function createVendor(input: VendorInput) {
  const vendor = await prisma.vendor.create({
    data: {
      companyName: input.companyName,
      contactPerson: input.contactPerson || null,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
    },
    include: VENDOR_INCLUDE,
  });
  return toDto(vendor);
}

export async function updateVendor(id: string, input: VendorInput) {
  await getVendor(id);
  const vendor = await prisma.vendor.update({
    where: { id },
    data: {
      companyName: input.companyName,
      contactPerson: input.contactPerson || null,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
    },
    include: VENDOR_INCLUDE,
  });
  return toDto(vendor);
}

export async function deleteVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: { _count: { select: { purchases: true } } },
  });
  if (!vendor) throw ApiError.notFound('Vendor not found.');
  if (vendor._count.purchases > 0) {
    throw ApiError.badRequest('Cannot delete a vendor that has purchases.');
  }
  await prisma.vendor.delete({ where: { id } });
}
