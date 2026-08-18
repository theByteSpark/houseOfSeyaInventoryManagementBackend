import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validateBody } from '@/middleware/validate';
import * as vendorsController from './vendors.controller';
import { vendorInputSchema } from './vendors.validation';

export const vendorsRoutes = Router();

vendorsRoutes.use(authenticate);

vendorsRoutes.get('/', asyncHandler(vendorsController.listVendorsHandler));
vendorsRoutes.get('/:id', asyncHandler(vendorsController.getVendorHandler));
// Create/update stay open to every authenticated role — vendors are
// routinely added inline while recording a purchase (see PurchaseFormPage's
// "Add new vendor" flow). Delete is destructive shared master data, so it
// is restricted.
vendorsRoutes.post('/', validateBody(vendorInputSchema), asyncHandler(vendorsController.createVendorHandler));
vendorsRoutes.patch('/:id', validateBody(vendorInputSchema), asyncHandler(vendorsController.updateVendorHandler));
vendorsRoutes.delete(
  '/:id',
  authorize('COMPANY_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(vendorsController.deleteVendorHandler),
);
