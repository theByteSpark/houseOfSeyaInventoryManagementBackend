import { z } from 'zod';

export const createEnquirySchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

export const confirmEnquirySchema = z.object({
  warehouseId: z.string().min(1).optional(),
  vendor: z.object({
    vendorId: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    price: z.coerce.number().nonnegative(),
  }),
  customer: z.object({
    customerId: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    price: z.coerce.number().nonnegative(),
  }),
});

export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;
export type ConfirmEnquiryInput = z.infer<typeof confirmEnquirySchema>;
