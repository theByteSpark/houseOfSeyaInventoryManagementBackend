import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as enquiriesController from './enquiries.controller';
import { enquiryInputSchema } from './enquiries.validation';

export const enquiriesRoutes = Router();

enquiriesRoutes.use(authenticate);

enquiriesRoutes.get('/', asyncHandler(enquiriesController.listEnquiriesHandler));
enquiriesRoutes.get('/:id', asyncHandler(enquiriesController.getEnquiryHandler));
enquiriesRoutes.post('/', validateBody(enquiryInputSchema), asyncHandler(enquiriesController.createEnquiryHandler));
enquiriesRoutes.patch('/:id', validateBody(enquiryInputSchema), asyncHandler(enquiriesController.updateEnquiryHandler));
enquiriesRoutes.delete('/:id', asyncHandler(enquiriesController.deleteEnquiryHandler));
