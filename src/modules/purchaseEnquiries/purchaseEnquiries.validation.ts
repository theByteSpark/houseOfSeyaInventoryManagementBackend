import { z } from 'zod';

export const purchaseEnquiryInputSchema = z.object({
  vendorId: z.string().min(1),
  subcategoryId: z.string().optional().or(z.literal('')),
  metalType: z.string().min(1),
  grossWeight: z.coerce.number().positive(),
  diamondShape: z.string().optional().or(z.literal('')),
  diamondQuality: z.string().optional().or(z.literal('')),
  diamondPieces: z.coerce.number().int().positive().optional(),
  diamondCaratWeight: z.coerce.number().positive().optional(),
});

export type PurchaseEnquiryInput = z.infer<typeof purchaseEnquiryInputSchema>;
