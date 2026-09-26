import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as enquiriesController from './enquiries.controller';
import { createEnquirySchema, editEnquirySchema, confirmEnquirySchema } from './enquiries.validation';

export const enquiriesRoutes = Router();

enquiriesRoutes.use(authenticate);

enquiriesRoutes.get('/', asyncHandler(enquiriesController.listEnquiriesHandler));
enquiriesRoutes.post('/', validateBody(createEnquirySchema), asyncHandler(enquiriesController.createEnquiryHandler));
enquiriesRoutes.patch(
  '/:id',
  validateBody(editEnquirySchema),
  asyncHandler(enquiriesController.editEnquiryHandler),
);
enquiriesRoutes.delete('/:id', asyncHandler(enquiriesController.deleteEnquiryHandler));
enquiriesRoutes.post(
  '/:id/confirm',
  validateBody(confirmEnquirySchema),
  asyncHandler(enquiriesController.confirmEnquiryHandler),
);
