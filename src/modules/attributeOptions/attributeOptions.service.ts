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

  if (input.label && input.label !== current.label) {
    const existing = await prisma.attributeOption.findUnique({
      where: { type_label: { type: current.type, label: input.label } },
    });
    if (existing) throw ApiError.conflict('This option already exists for that attribute type.');
  }

  return prisma.attributeOption.update({ where: { id }, data: input });
}

export async function deleteAttributeOption(id: string) {
  const existing = await prisma.attributeOption.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Attribute option not found.');
  await prisma.attributeOption.delete({ where: { id } });
}
