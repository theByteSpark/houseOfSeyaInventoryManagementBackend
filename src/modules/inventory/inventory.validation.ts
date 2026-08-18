import { z } from 'zod';

export const productInputSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  reorderLevel: z.coerce.number().int().min(0),
  categoryId: z.string().optional().or(z.literal('')),
  quantityInStock: z.coerce.number().int().min(0).optional(),
  warehouseId: z.string().optional(),
});

export const restockInputSchema = z.object({
  quantity: z.coerce.number().int().positive(),
  reason: z.string().optional(),
  warehouseId: z.string().optional(),
});

export const categoryInputSchema = z.object({
  name: z.string().min(1),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type RestockInput = z.infer<typeof restockInputSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
