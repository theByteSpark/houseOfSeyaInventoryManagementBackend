import { z } from 'zod';

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
