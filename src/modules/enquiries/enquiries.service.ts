import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { EnquiryInput } from './enquiries.validation';

const ENQUIRY_INCLUDE = {
  customer: { select: { name: true } },
  subcategory: { include: { category: { select: { id: true, name: true } } } },
} satisfies Prisma.EnquiryInclude;

type EnquiryWithRelations = Prisma.EnquiryGetPayload<{ include: typeof ENQUIRY_INCLUDE }>;

function toDto(enquiry: EnquiryWithRelations) {
  return {
    id: enquiry.id,
    customerId: enquiry.customerId,
    customerName: enquiry.customer.name,
    subcategoryId: enquiry.subcategoryId,
    subcategoryName: enquiry.subcategory?.name ?? null,
    categoryId: enquiry.subcategory?.category.id ?? null,
    categoryName: enquiry.subcategory?.category.name ?? null,
    metalType: enquiry.metalType,
    grossWeight: Number(enquiry.grossWeight),
    diamondShape: enquiry.diamondShape,
    diamondQuality: enquiry.diamondQuality,
    diamondPieces: enquiry.diamondPieces,
    diamondCaratWeight: enquiry.diamondCaratWeight !== null ? Number(enquiry.diamondCaratWeight) : null,
    sellingAmount: enquiry.sellingAmount !== null ? Number(enquiry.sellingAmount) : null,
    createdAt: enquiry.createdAt,
  };
}

export async function listEnquiries() {
  const enquiries = await prisma.enquiry.findMany({
    include: ENQUIRY_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return enquiries.map(toDto);
}

export async function listEnquiriesPaginated(
  params: PaginationParams,
): Promise<PaginatedResult<ReturnType<typeof toDto>>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const where: Prisma.EnquiryWhereInput = search
    ? {
        OR: [
          { customer: { name: { contains: search, mode: 'insensitive' } } },
          { metalType: { contains: search, mode: 'insensitive' } },
          { subcategory: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }
    : {};

  const orderBy: Prisma.EnquiryOrderByWithRelationInput =
    sortBy === 'customer'
      ? { customer: { name: sortDir } }
      : sortBy === 'subcategory'
        ? { subcategory: { name: sortDir } }
        : sortBy === 'metalType' || sortBy === 'grossWeight' || sortBy === 'createdAt'
          ? { [sortBy]: sortDir }
          : { createdAt: 'desc' };

  const [total, enquiries] = await prisma.$transaction([
    prisma.enquiry.count({ where }),
    prisma.enquiry.findMany({
      where,
      include: ENQUIRY_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: enquiries.map(toDto), total, page, pageSize };
}

export async function getEnquiry(id: string) {
  const enquiry = await prisma.enquiry.findUnique({ where: { id }, include: ENQUIRY_INCLUDE });
  if (!enquiry) throw ApiError.notFound('Enquiry not found.');
  return toDto(enquiry);
}

export async function createEnquiry(input: EnquiryInput) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found.');

  if (input.subcategoryId) {
    const subcategory = await prisma.subcategory.findUnique({ where: { id: input.subcategoryId } });
    if (!subcategory) throw ApiError.notFound('Subcategory not found.');
  }

  const enquiry = await prisma.enquiry.create({
    data: {
      customerId: input.customerId,
      subcategoryId: input.subcategoryId || null,
      metalType: input.metalType,
      grossWeight: input.grossWeight,
      diamondShape: input.diamondShape || null,
      diamondQuality: input.diamondQuality || null,
      diamondPieces: input.diamondPieces ?? null,
      diamondCaratWeight: input.diamondCaratWeight ?? null,
      sellingAmount: input.sellingAmount,
    },
    include: ENQUIRY_INCLUDE,
  });

  return toDto(enquiry);
}

export async function updateEnquiry(id: string, input: EnquiryInput) {
  const current = await prisma.enquiry.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('Enquiry not found.');

  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found.');

  if (input.subcategoryId) {
    const subcategory = await prisma.subcategory.findUnique({ where: { id: input.subcategoryId } });
    if (!subcategory) throw ApiError.notFound('Subcategory not found.');
  }

  await prisma.enquiry.update({
    where: { id },
    data: {
      customerId: input.customerId,
      subcategoryId: input.subcategoryId || null,
      metalType: input.metalType,
      grossWeight: input.grossWeight,
      diamondShape: input.diamondShape || null,
      diamondQuality: input.diamondQuality || null,
      diamondPieces: input.diamondPieces ?? null,
      diamondCaratWeight: input.diamondCaratWeight ?? null,
      sellingAmount: input.sellingAmount,
    },
  });

  return getEnquiry(id);
}

export async function deleteEnquiry(id: string) {
  const enquiry = await prisma.enquiry.findUnique({ where: { id } });
  if (!enquiry) throw ApiError.notFound('Enquiry not found.');
  await prisma.enquiry.delete({ where: { id } });
}
