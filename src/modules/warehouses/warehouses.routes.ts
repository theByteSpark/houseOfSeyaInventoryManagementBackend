import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validateBody } from '@/middleware/validate';
import * as warehousesController from './warehouses.controller';
import { warehouseInputSchema } from './warehouses.validation';

export const warehousesRoutes = Router();

warehousesRoutes.use(authenticate);

// Everyone authenticated can list/view warehouses (e.g. for pickers); only
// company-level roles can create/edit/delete them.
warehousesRoutes.get('/', asyncHandler(warehousesController.listWarehousesHandler));
warehousesRoutes.get('/:id', asyncHandler(warehousesController.getWarehouseHandler));

warehousesRoutes.use(authorize('COMPANY_ADMIN', 'SUPER_ADMIN'));
warehousesRoutes.post('/', validateBody(warehouseInputSchema), asyncHandler(warehousesController.createWarehouseHandler));
warehousesRoutes.patch('/:id', validateBody(warehouseInputSchema), asyncHandler(warehousesController.updateWarehouseHandler));
warehousesRoutes.delete('/:id', asyncHandler(warehousesController.deleteWarehouseHandler));
