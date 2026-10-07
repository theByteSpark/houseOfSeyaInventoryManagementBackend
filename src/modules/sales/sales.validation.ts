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
    // Every sale collects something — a full payment for an existing item,
    // or at least an advance for a custom/backorder one. Zero-deposit
    // ("bill later") sales don't happen in this business, so this is
    // required rather than defaulting to 0.
    receivedAmount: z.coerce.number().positive('Enter the amount received — every sale collects something upfront'),
  })
  .refine((data) => !(data.discountPercent !== undefined && data.discountAmount !== undefined), {
    message: 'Use either a discount percentage or a discount amount, not both',
    path: ['discountAmount'],
  });

export type SaleInput = z.infer<typeof saleInputSchema>;
