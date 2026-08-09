import type { AuthenticatedUser } from '@/middleware/authenticate';
import { ApiError } from '@/utils/apiError';

const COMPANY_LEVEL_ROLES = ['COMPANY_ADMIN', 'SUPER_ADMIN'] as const;

export function isCompanyLevel(user: AuthenticatedUser): boolean {
  return (COMPANY_LEVEL_ROLES as readonly string[]).includes(user.role);
}

// Warehouse-scoped roles (USER/ADMIN) must resolve to their mapped warehouse;
// company-level roles pass an explicit warehouseId (e.g. from the request body).
export function requireWarehouseId(user: AuthenticatedUser, explicitWarehouseId?: string): string {
  if (isCompanyLevel(user)) {
    if (!explicitWarehouseId) {
      throw ApiError.badRequest('warehouseId is required.');
    }
    return explicitWarehouseId;
  }

  if (!user.warehouseId) {
    throw ApiError.badRequest('Your account is not assigned to a warehouse.');
  }
  return user.warehouseId;
}
