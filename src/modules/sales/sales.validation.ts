import { z } from 'zod';

export const saleLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

export const saleInputSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(saleLineSchema).min(1),
  taxRate: z.coerce.number().min(0).max(1).optional(),
});

export type SaleInput = z.infer<typeof saleInputSchema>;
