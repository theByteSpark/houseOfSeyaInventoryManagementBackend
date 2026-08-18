import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import * as reportsController from './reports.controller';

export const reportsRoutes = Router();

reportsRoutes.use(authenticate);

reportsRoutes.get('/sales', asyncHandler(reportsController.getSalesReportHandler));
reportsRoutes.get('/purchases', asyncHandler(reportsController.getPurchasesReportHandler));
reportsRoutes.get('/inventory', asyncHandler(reportsController.getInventoryReportHandler));
reportsRoutes.get('/recent-sales-by-product', asyncHandler(reportsController.getRecentSalesByProductHandler));
