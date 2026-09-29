import { z } from 'zod';

export const productInputSchema = z.object({
  designNumber: z.string().min(1),
  name: z.string().min(1),
  metalType: z.string().min(1),
  grossWeight: z.coerce.number().positive(),
  metalRatePerGram: z.coerce.number().positive(),
  diamondShape: z.string().min(1),
  diamondQuality: z.string().min(1),
  diamondPieces: z.coerce.number().int().positive(),
  diamondCaratWeight: z.coerce.number().positive(),
  diamondRate: z.coerce.number().positive(),
  makingChargePerGram: z.coerce.number().min(0),
  fixedExpense: z.coerce.number().min(0).default(0),
  sellingPrice: z.coerce.number().positive(),
  quantityInStock: z.coerce.number().int().min(0),
  reorderLevel: z.coerce.number().int().min(0),
  subcategoryId: z.string().optional().or(z.literal('')),
});

export const restockInputSchema = z.object({
  quantity: z.coerce.number().int().positive(),
  reason: z.string().optional(),
});

export const categoryInputSchema = z.object({
  name: z.string().min(1),
});

export const subcategoryInputSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().min(1),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type RestockInput = z.infer<typeof restockInputSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type SubcategoryInput = z.infer<typeof subcategoryInputSchema>;
