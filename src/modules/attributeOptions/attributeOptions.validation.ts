import { z } from 'zod';

export const attributeTypeSchema = z.enum(['METAL', 'DIAMOND_SHAPE', 'DIAMOND_QUALITY']);

export const attributeOptionInputSchema = z.object({
  type: attributeTypeSchema,
  label: z.string().min(1),
  sortOrder: z.coerce.number().int().default(0),
});

export const attributeOptionUpdateSchema = z.object({
  label: z.string().min(1).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export type AttributeType = z.infer<typeof attributeTypeSchema>;
export type AttributeOptionInput = z.infer<typeof attributeOptionInputSchema>;
export type AttributeOptionUpdateInput = z.infer<typeof attributeOptionUpdateSchema>;
