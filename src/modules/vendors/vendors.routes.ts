import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as vendorsController from './vendors.controller';
import { vendorInputSchema } from './vendors.validation';

export const vendorsRoutes = Router();

vendorsRoutes.use(authenticate);

vendorsRoutes.get('/', asyncHandler(vendorsController.listVendorsHandler));
vendorsRoutes.get('/:id', asyncHandler(vendorsController.getVendorHandler));
vendorsRoutes.post('/', validateBody(vendorInputSchema), asyncHandler(vendorsController.createVendorHandler));
vendorsRoutes.patch('/:id', validateBody(vendorInputSchema), asyncHandler(vendorsController.updateVendorHandler));
vendorsRoutes.delete('/:id', asyncHandler(vendorsController.deleteVendorHandler));
