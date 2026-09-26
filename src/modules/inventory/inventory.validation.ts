import { z } from 'zod';

export const productInputSchema = z.object({
  designNumber: z.string().min(1),
  name: z.string().min(1),
  metalType: z.string().min(1),
  grossWeight: z.coerce.number().positive(),
  metalRatePerGram: z.coerce.number().positive(),
  diamondShape: z.string().optional(),
  diamondQuality: z.string().optional(),
  diamondPieces: z.coerce.number().int().positive().optional(),
  diamondCaratWeight: z.coerce.number().positive().optional(),
  diamondWeight: z.coerce.number().positive().optional(),
  diamondRate: z.coerce.number().positive().optional(),
  makingChargePerGram: z.coerce.number().min(0),
  fixedExpense: z.coerce.number().min(0).default(0),
  sellingPrice: z.coerce.number().positive(),
  quantityInStock: z.coerce.number().int().min(0),
  reorderLevel: z.coerce.number().int().min(0),
  subcategoryId: z.string().optional().or(z.literal('')),
}).refine(
  (data) => (data.diamondCaratWeight != null) === (data.diamondRate != null),
  { message: 'Enter both carat weight and rate to calculate diamond cost', path: ['diamondRate'] },
);

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
