import { z } from 'zod';

export const enquiryInputSchema = z.object({
  customerId: z.string().min(1),
  subcategoryId: z.string().optional().or(z.literal('')),
  metalType: z.string().min(1),
  grossWeight: z.coerce.number().positive(),
  diamondShape: z.string().optional().or(z.literal('')),
  diamondQuality: z.string().optional().or(z.literal('')),
  diamondPieces: z.coerce.number().int().positive().optional(),
  diamondCaratWeight: z.coerce.number().positive().optional(),
  sellingAmount: z.coerce.number().positive(),
});

export type EnquiryInput = z.infer<typeof enquiryInputSchema>;
