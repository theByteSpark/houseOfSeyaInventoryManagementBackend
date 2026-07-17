import { z } from 'zod';

export const invoiceLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

export const invoiceInputSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(invoiceLineSchema).min(1),
  taxRate: z.coerce.number().min(0).max(1).optional(),
});

export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
