import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as stockConversionsController from './stock-conversions.controller';
import { createConversionSchema } from './stock-conversions.validation';

export const stockConversionsRoutes = Router();

stockConversionsRoutes.use(authenticate);

stockConversionsRoutes.get('/', asyncHandler(stockConversionsController.listConversionsHandler));
stockConversionsRoutes.post(
  '/',
  validateBody(createConversionSchema),
  asyncHandler(stockConversionsController.createConversionHandler),
);
