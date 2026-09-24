import { z } from 'zod';

export const enquiryDiamondInputSchema = z.object({
  shape: z.string().min(1),
  quality: z.string().min(1),
  pieces: z.coerce.number().int().positive(),
  caratWeight: z.coerce.number().positive(),
});

export const enquiryInputSchema = z.object({
  customerId: z.string().min(1),
  subcategoryId: z.string().optional().or(z.literal('')),
  metalType: z.string().min(1),
  grossWeight: z.coerce.number().positive(),
  diamonds: z.array(enquiryDiamondInputSchema).default([]),
});

export type EnquiryDiamondInput = z.infer<typeof enquiryDiamondInputSchema>;
export type EnquiryInput = z.infer<typeof enquiryInputSchema>;
