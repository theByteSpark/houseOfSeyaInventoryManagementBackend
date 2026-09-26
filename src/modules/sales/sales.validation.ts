import { z } from 'zod';

export const saleLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
});

export const saleInputSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(saleLineSchema).min(1),
  warehouseId: z.string().optional(),
  completionDate: z.coerce.date().optional(),
});

export type SaleInput = z.infer<typeof saleInputSchema>;
