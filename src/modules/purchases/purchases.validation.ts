import { z } from 'zod';

export const purchaseLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().min(0),
});

export const purchaseInputSchema = z.object({
  vendorId: z.string().min(1),
  items: z.array(purchaseLineSchema).min(1),
  warehouseId: z.string().optional(),
});

export type PurchaseInput = z.infer<typeof purchaseInputSchema>;
