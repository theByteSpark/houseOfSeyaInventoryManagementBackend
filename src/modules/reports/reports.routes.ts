import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import * as reportsController from './reports.controller';

export const reportsRoutes = Router();

reportsRoutes.use(authenticate);

// The three aggregate/conclusion endpoints behind the actual Reports page --
// restricted to Warehouse Admin and up, same as the frontend route guard on
// /reports. recent-sales-by-product is deliberately NOT restricted below --
// it powers the Dashboard's "recent items" widget, which every role
// (including Warehouse Manager) sees as part of their daily work.
const REPORT_ROLES = ['ADMIN', 'COMPANY_ADMIN', 'SUPER_ADMIN'] as const;
reportsRoutes.get('/sales', authorize(...REPORT_ROLES), asyncHandler(reportsController.getSalesReportHandler));
reportsRoutes.get('/purchases', authorize(...REPORT_ROLES), asyncHandler(reportsController.getPurchasesReportHandler));
reportsRoutes.get('/inventory', authorize(...REPORT_ROLES), asyncHandler(reportsController.getInventoryReportHandler));
reportsRoutes.get('/recent-sales-by-product', asyncHandler(reportsController.getRecentSalesByProductHandler));
