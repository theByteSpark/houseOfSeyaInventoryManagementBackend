import { z } from 'zod';

export const createConversionSchema = z
  .object({
    fromProductId: z.string().min(1),
    toProductId: z.string().min(1),
    warehouseId: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
  })
  .refine((d) => d.fromProductId !== d.toProductId, {
    message: 'Source and destination product must differ.',
    path: ['toProductId'],
  });

export type CreateConversionInput = z.infer<typeof createConversionSchema>;
