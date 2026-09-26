import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as salesController from './sales.controller';
import { saleInputSchema } from './sales.validation';

export const salesRoutes = Router();

salesRoutes.use(authenticate);

salesRoutes.get('/', asyncHandler(salesController.listSalesHandler));
salesRoutes.get('/:id', asyncHandler(salesController.getSaleHandler));
salesRoutes.post('/', validateBody(saleInputSchema), asyncHandler(salesController.createSaleHandler));
salesRoutes.patch('/:id', validateBody(saleInputSchema), asyncHandler(salesController.updateSaleHandler));
salesRoutes.patch('/:id/cancel', asyncHandler(salesController.cancelSaleHandler));
salesRoutes.patch('/:id/complete', asyncHandler(salesController.completeSaleHandler));
