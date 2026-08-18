import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as enquiriesController from './enquiries.controller';
import { createEnquirySchema, confirmEnquirySchema } from './enquiries.validation';

export const enquiriesRoutes = Router();

enquiriesRoutes.use(authenticate);

enquiriesRoutes.get('/', asyncHandler(enquiriesController.listEnquiriesHandler));
enquiriesRoutes.post('/', validateBody(createEnquirySchema), asyncHandler(enquiriesController.createEnquiryHandler));
enquiriesRoutes.post(
  '/:id/confirm',
  validateBody(confirmEnquirySchema),
  asyncHandler(enquiriesController.confirmEnquiryHandler),
);
