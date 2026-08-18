import { z } from 'zod';

export const createTransferSchema = z
  .object({
    productId: z.string().min(1),
    fromWarehouseId: z.string().min(1),
    toWarehouseId: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
  })
  .refine((d) => d.fromWarehouseId !== d.toWarehouseId, {
    message: 'Source and destination warehouse must differ.',
    path: ['toWarehouseId'],
  });

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
