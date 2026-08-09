import { z } from 'zod';

export const warehouseInputSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional().or(z.literal('')),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type WarehouseInput = z.infer<typeof warehouseInputSchema>;
