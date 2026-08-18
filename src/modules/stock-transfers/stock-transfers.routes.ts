import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validateBody } from '@/middleware/validate';
import * as stockTransfersController from './stock-transfers.controller';
import { createTransferSchema } from './stock-transfers.validation';

export const stockTransfersRoutes = Router();

stockTransfersRoutes.use(authenticate);
stockTransfersRoutes.use(authorize('COMPANY_ADMIN', 'SUPER_ADMIN'));

stockTransfersRoutes.get('/', asyncHandler(stockTransfersController.listTransfersHandler));
stockTransfersRoutes.post('/', validateBody(createTransferSchema), asyncHandler(stockTransfersController.createTransferHandler));
