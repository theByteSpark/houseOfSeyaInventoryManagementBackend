import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validateBody } from '@/middleware/validate';
import * as purchaseEnquiriesController from './purchaseEnquiries.controller';
import { purchaseEnquiryInputSchema } from './purchaseEnquiries.validation';

export const purchaseEnquiriesRoutes = Router();

purchaseEnquiriesRoutes.use(authenticate);

purchaseEnquiriesRoutes.get('/', asyncHandler(purchaseEnquiriesController.listPurchaseEnquiriesHandler));
purchaseEnquiriesRoutes.get('/:id', asyncHandler(purchaseEnquiriesController.getPurchaseEnquiryHandler));
purchaseEnquiriesRoutes.post(
  '/',
  validateBody(purchaseEnquiryInputSchema),
  asyncHandler(purchaseEnquiriesController.createPurchaseEnquiryHandler),
);
purchaseEnquiriesRoutes.patch(
  '/:id',
  validateBody(purchaseEnquiryInputSchema),
  asyncHandler(purchaseEnquiriesController.updatePurchaseEnquiryHandler),
);
purchaseEnquiriesRoutes.delete('/:id', authorize('ADMIN'), asyncHandler(purchaseEnquiriesController.deletePurchaseEnquiryHandler));
