import { z } from 'zod';

export const saleLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

export const saleInputSchema = z
  .object({
    customerId: z.string().min(1),
    items: z.array(saleLineSchema).min(1),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    discountAmount: z.coerce.number().min(0).optional(),
    receivedAmount: z.coerce.number().min(0).optional(),
  })
  .refine((data) => !(data.discountPercent !== undefined && data.discountAmount !== undefined), {
    message: 'Use either a discount percentage or a discount amount, not both',
    path: ['discountAmount'],
  });

export type SaleInput = z.infer<typeof saleInputSchema>;
