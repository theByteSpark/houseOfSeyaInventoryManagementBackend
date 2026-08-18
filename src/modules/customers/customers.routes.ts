import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validateBody } from '@/middleware/validate';
import * as customersController from './customers.controller';
import { customerInputSchema } from './customers.validation';

export const customersRoutes = Router();

customersRoutes.use(authenticate);

customersRoutes.get('/', asyncHandler(customersController.listCustomersHandler));
customersRoutes.get('/:id', asyncHandler(customersController.getCustomerHandler));
// Create/update stay open to every authenticated role — customers are
// routinely added inline while recording a sale (see SaleFormPage's "Add
// new customer" flow), so this must not be restricted to company-level
// roles. Delete is destructive shared master data, so it is restricted.
customersRoutes.post('/', validateBody(customerInputSchema), asyncHandler(customersController.createCustomerHandler));
customersRoutes.patch('/:id', validateBody(customerInputSchema), asyncHandler(customersController.updateCustomerHandler));
customersRoutes.delete(
  '/:id',
  authorize('COMPANY_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(customersController.deleteCustomerHandler),
);
