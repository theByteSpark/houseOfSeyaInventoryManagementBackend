import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as invoicesController from './invoices.controller';
import { invoiceInputSchema } from './invoices.validation';

export const invoicesRoutes = Router();

invoicesRoutes.use(authenticate);

invoicesRoutes.get('/', asyncHandler(invoicesController.listInvoicesHandler));
invoicesRoutes.get('/:id', asyncHandler(invoicesController.getInvoiceHandler));
invoicesRoutes.post('/', validateBody(invoiceInputSchema), asyncHandler(invoicesController.createInvoiceHandler));
invoicesRoutes.patch('/:id/issue', asyncHandler(invoicesController.issueInvoiceHandler));
invoicesRoutes.patch('/:id/pay', asyncHandler(invoicesController.markInvoicePaidHandler));
invoicesRoutes.patch('/:id/cancel', asyncHandler(invoicesController.cancelInvoiceHandler));
