import { z } from 'zod';

export const createBlockedQuantitySchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  warehouseId: z.string().min(1).optional(),
});

export const editBlockedQuantitySchema = z.object({
  additionalQuantity: z.coerce.number().int().positive(),
});

export const confirmBlockedQuantitySchema = z.object({
  customerId: z.string().min(1),
  unitPrice: z.coerce.number().nonnegative(),
});

export type CreateBlockedQuantityInput = z.infer<typeof createBlockedQuantitySchema>;
export type EditBlockedQuantityInput = z.infer<typeof editBlockedQuantitySchema>;
export type ConfirmBlockedQuantityInput = z.infer<typeof confirmBlockedQuantitySchema>;
