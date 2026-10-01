import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { AttributeOptionInput, AttributeOptionUpdateInput, AttributeType } from './attributeOptions.validation';

export async function listAttributeOptions(type?: AttributeType) {
  return prisma.attributeOption.findMany({
    where: type ? { type } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
}

export async function createAttributeOption(input: AttributeOptionInput) {
  const existing = await prisma.attributeOption.findUnique({
    where: { type_label: { type: input.type, label: input.label } },
  });
  if (existing) throw ApiError.conflict('This option already exists for that attribute type.');

  return prisma.attributeOption.create({ data: input });
}

export async function updateAttributeOption(id: string, input: AttributeOptionUpdateInput) {
  const current = await prisma.attributeOption.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('Attribute option not found.');

  const newLabel = input.label;
  const renaming = newLabel !== undefined && newLabel !== current.label;

  if (renaming) {
    const existing = await prisma.attributeOption.findUnique({
      where: { type_label: { type: current.type, label: newLabel as string } },
    });
    if (existing) throw ApiError.conflict('This option already exists for that attribute type.');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.attributeOption.update({ where: { id }, data: input });

    // Metal type / diamond shape / diamond quality are stored as plain
    // strings on Product/Enquiry/PurchaseEnquiry, not a foreign key to
    // AttributeOption -- so renaming a label here has to be propagated to
    // every existing record that already carries the old value, or they'd
    // be stuck showing a value no longer offered in the picker.
    if (renaming) {
      const oldLabel = current.label;
      const label = newLabel as string;

      switch (current.type) {
        case 'METAL':
          await tx.product.updateMany({ where: { metalType: oldLabel }, data: { metalType: label } });
          await tx.enquiry.updateMany({ where: { metalType: oldLabel }, data: { metalType: label } });
          await tx.purchaseEnquiry.updateMany({ where: { metalType: oldLabel }, data: { metalType: label } });
          break;
        case 'DIAMOND_SHAPE':
          await tx.product.updateMany({ where: { diamondShape: oldLabel }, data: { diamondShape: label } });
          await tx.enquiry.updateMany({ where: { diamondShape: oldLabel }, data: { diamondShape: label } });
          await tx.purchaseEnquiry.updateMany({ where: { diamondShape: oldLabel }, data: { diamondShape: label } });
          break;
        case 'DIAMOND_QUALITY':
          await tx.product.updateMany({ where: { diamondQuality: oldLabel }, data: { diamondQuality: label } });
          await tx.enquiry.updateMany({ where: { diamondQuality: oldLabel }, data: { diamondQuality: label } });
          await tx.purchaseEnquiry.updateMany({ where: { diamondQuality: oldLabel }, data: { diamondQuality: label } });
          break;
      }
    }

    return updated;
  });
}

export async function deleteAttributeOption(id: string) {
  const existing = await prisma.attributeOption.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Attribute option not found.');
  await prisma.attributeOption.delete({ where: { id } });
}
