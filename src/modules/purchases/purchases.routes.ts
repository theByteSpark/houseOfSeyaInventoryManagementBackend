import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as purchasesController from './purchases.controller';
import { purchaseInputSchema } from './purchases.validation';

export const purchasesRoutes = Router();

purchasesRoutes.use(authenticate);

purchasesRoutes.get('/', asyncHandler(purchasesController.listPurchasesHandler));
purchasesRoutes.get('/:id', asyncHandler(purchasesController.getPurchaseHandler));
purchasesRoutes.post('/', validateBody(purchaseInputSchema), asyncHandler(purchasesController.createPurchaseHandler));
purchasesRoutes.patch('/:id', validateBody(purchaseInputSchema), asyncHandler(purchasesController.updatePurchaseHandler));
purchasesRoutes.patch('/:id/inward-transit', asyncHandler(purchasesController.inwardTransitPurchaseHandler));
purchasesRoutes.patch('/:id/in-stock', asyncHandler(purchasesController.inStockPurchaseHandler));
purchasesRoutes.patch('/:id/cancel', asyncHandler(purchasesController.cancelPurchaseHandler));
