import { z } from 'zod';

const ROLES = ['USER', 'ADMIN', 'COMPANY_ADMIN', 'SUPER_ADMIN'] as const;
const WAREHOUSE_SCOPED_ROLES = new Set(['USER', 'ADMIN']);

export const createUserSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(ROLES).optional(),
    warehouseId: z.string().optional(),
  })
  .refine(
    (data) => {
      const role = data.role ?? 'USER';
      return WAREHOUSE_SCOPED_ROLES.has(role) ? !!data.warehouseId : !data.warehouseId;
    },
    {
      message: 'warehouseId is required for USER/ADMIN roles and must be omitted for COMPANY_ADMIN/SUPER_ADMIN.',
      path: ['warehouseId'],
    },
  );

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z.enum(ROLES).optional(),
    warehouseId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (!data.role) return true;
      return WAREHOUSE_SCOPED_ROLES.has(data.role) ? !!data.warehouseId : !data.warehouseId;
    },
    {
      message: 'warehouseId is required for USER/ADMIN roles and must be omitted for COMPANY_ADMIN/SUPER_ADMIN.',
      path: ['warehouseId'],
    },
  );

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
