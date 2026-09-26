import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validateBody } from '@/middleware/validate';
import * as attributeOptionsController from './attributeOptions.controller';
import { attributeOptionInputSchema, attributeOptionUpdateSchema } from './attributeOptions.validation';

export const attributeOptionsRoutes = Router();

attributeOptionsRoutes.use(authenticate);

attributeOptionsRoutes.get('/', asyncHandler(attributeOptionsController.listAttributeOptionsHandler));
attributeOptionsRoutes.post(
  '/',
  authorize('ADMIN'),
  validateBody(attributeOptionInputSchema),
  asyncHandler(attributeOptionsController.createAttributeOptionHandler),
);
attributeOptionsRoutes.patch(
  '/:id',
  authorize('ADMIN'),
  validateBody(attributeOptionUpdateSchema),
  asyncHandler(attributeOptionsController.updateAttributeOptionHandler),
);
attributeOptionsRoutes.delete(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(attributeOptionsController.deleteAttributeOptionHandler),
);
