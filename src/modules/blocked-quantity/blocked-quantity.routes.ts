import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as blockedQuantityController from './blocked-quantity.controller';
import {
  createBlockedQuantitySchema,
  editBlockedQuantitySchema,
  confirmBlockedQuantitySchema,
} from './blocked-quantity.validation';

export const blockedQuantityRoutes = Router();

blockedQuantityRoutes.use(authenticate);

blockedQuantityRoutes.get('/', asyncHandler(blockedQuantityController.listBlockedQuantitiesHandler));
blockedQuantityRoutes.post(
  '/',
  validateBody(createBlockedQuantitySchema),
  asyncHandler(blockedQuantityController.createBlockedQuantityHandler),
);
blockedQuantityRoutes.patch(
  '/:id',
  validateBody(editBlockedQuantitySchema),
  asyncHandler(blockedQuantityController.editBlockedQuantityHandler),
);
blockedQuantityRoutes.delete('/:id', asyncHandler(blockedQuantityController.deleteBlockedQuantityHandler));
blockedQuantityRoutes.post(
  '/:id/confirm',
  validateBody(confirmBlockedQuantitySchema),
  asyncHandler(blockedQuantityController.confirmBlockedQuantityHandler),
);
