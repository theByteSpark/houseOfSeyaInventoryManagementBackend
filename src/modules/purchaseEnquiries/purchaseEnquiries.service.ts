import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { PaginatedResult, PaginationParams } from '@/utils/pagination';
import type { PurchaseEnquiryInput } from './purchaseEnquiries.validation';

const PURCHASE_ENQUIRY_INCLUDE = {
  vendor: { select: { companyName: true } },
  subcategory: { include: { category: { select: { id: true, name: true } } } },
} satisfies Prisma.PurchaseEnquiryInclude;

type PurchaseEnquiryWithRelations = Prisma.PurchaseEnquiryGetPayload<{ include: typeof PURCHASE_ENQUIRY_INCLUDE }>;

function toDto(enquiry: PurchaseEnquiryWithRelations) {
  return {
    id: enquiry.id,
    vendorId: enquiry.vendorId,
    vendorName: enquiry.vendor.companyName,
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
    createdAt: enquiry.createdAt,
  };
}

export async function listPurchaseEnquiries() {
  const enquiries = await prisma.purchaseEnquiry.findMany({
    include: PURCHASE_ENQUIRY_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return enquiries.map(toDto);
}

export async function listPurchaseEnquiriesPaginated(
  params: PaginationParams,
): Promise<PaginatedResult<ReturnType<typeof toDto>>> {
  const { page, pageSize, search, sortBy, sortDir } = params;

  const where: Prisma.PurchaseEnquiryWhereInput = search
    ? {
        OR: [
          { vendor: { companyName: { contains: search, mode: 'insensitive' } } },
          { metalType: { contains: search, mode: 'insensitive' } },
          { subcategory: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }
    : {};

  const orderBy: Prisma.PurchaseEnquiryOrderByWithRelationInput =
    sortBy === 'vendor'
      ? { vendor: { companyName: sortDir } }
      : sortBy === 'subcategory'
        ? { subcategory: { name: sortDir } }
        : sortBy === 'metalType' || sortBy === 'grossWeight' || sortBy === 'createdAt'
          ? { [sortBy]: sortDir }
          : { createdAt: 'desc' };

  const [total, enquiries] = await prisma.$transaction([
    prisma.purchaseEnquiry.count({ where }),
    prisma.purchaseEnquiry.findMany({
      where,
      include: PURCHASE_ENQUIRY_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: enquiries.map(toDto), total, page, pageSize };
}

export async function getPurchaseEnquiry(id: string) {
  const enquiry = await prisma.purchaseEnquiry.findUnique({ where: { id }, include: PURCHASE_ENQUIRY_INCLUDE });
  if (!enquiry) throw ApiError.notFound('Purchase enquiry not found.');
  return toDto(enquiry);
}

export async function createPurchaseEnquiry(input: PurchaseEnquiryInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw ApiError.notFound('Vendor not found.');

  if (input.subcategoryId) {
    const subcategory = await prisma.subcategory.findUnique({ where: { id: input.subcategoryId } });
    if (!subcategory) throw ApiError.notFound('Subcategory not found.');
  }

  const enquiry = await prisma.purchaseEnquiry.create({
    data: {
      vendorId: input.vendorId,
      subcategoryId: input.subcategoryId || null,
      metalType: input.metalType,
      grossWeight: input.grossWeight,
      diamondShape: input.diamondShape || null,
      diamondQuality: input.diamondQuality || null,
      diamondPieces: input.diamondPieces ?? null,
      diamondCaratWeight: input.diamondCaratWeight ?? null,
    },
    include: PURCHASE_ENQUIRY_INCLUDE,
  });

  return toDto(enquiry);
}

export async function updatePurchaseEnquiry(id: string, input: PurchaseEnquiryInput) {
  const current = await prisma.purchaseEnquiry.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('Purchase enquiry not found.');

  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw ApiError.notFound('Vendor not found.');

  if (input.subcategoryId) {
    const subcategory = await prisma.subcategory.findUnique({ where: { id: input.subcategoryId } });
    if (!subcategory) throw ApiError.notFound('Subcategory not found.');
  }

  await prisma.purchaseEnquiry.update({
    where: { id },
    data: {
      vendorId: input.vendorId,
      subcategoryId: input.subcategoryId || null,
      metalType: input.metalType,
      grossWeight: input.grossWeight,
      diamondShape: input.diamondShape || null,
      diamondQuality: input.diamondQuality || null,
      diamondPieces: input.diamondPieces ?? null,
      diamondCaratWeight: input.diamondCaratWeight ?? null,
    },
  });

  return getPurchaseEnquiry(id);
}

export async function deletePurchaseEnquiry(id: string) {
  const enquiry = await prisma.purchaseEnquiry.findUnique({ where: { id } });
  if (!enquiry) throw ApiError.notFound('Purchase enquiry not found.');
  await prisma.purchaseEnquiry.delete({ where: { id } });
}
