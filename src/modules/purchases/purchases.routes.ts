import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validateBody } from '@/middleware/validate';
import * as purchasesController from './purchases.controller';
import { purchaseInputSchema, receiveInputSchema } from './purchases.validation';

export const purchasesRoutes = Router();

purchasesRoutes.use(authenticate);

purchasesRoutes.get('/', asyncHandler(purchasesController.listPurchasesHandler));
purchasesRoutes.get('/:id', asyncHandler(purchasesController.getPurchaseHandler));
purchasesRoutes.post('/', validateBody(purchaseInputSchema), asyncHandler(purchasesController.createPurchaseHandler));
purchasesRoutes.patch('/:id', validateBody(purchaseInputSchema), asyncHandler(purchasesController.updatePurchaseHandler));
purchasesRoutes.patch('/:id/order', asyncHandler(purchasesController.orderPurchaseHandler));
purchasesRoutes.patch('/:id/receive', validateBody(receiveInputSchema), asyncHandler(purchasesController.receivePurchaseHandler));
purchasesRoutes.patch('/:id/cancel', authorize('ADMIN'), asyncHandler(purchasesController.cancelPurchaseHandler));
