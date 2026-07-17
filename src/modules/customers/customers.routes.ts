import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as customersController from './customers.controller';
import { customerInputSchema } from './customers.validation';

export const customersRoutes = Router();

customersRoutes.use(authenticate);

customersRoutes.get('/', asyncHandler(customersController.listCustomersHandler));
customersRoutes.get('/:id', asyncHandler(customersController.getCustomerHandler));
customersRoutes.post('/', validateBody(customerInputSchema), asyncHandler(customersController.createCustomerHandler));
customersRoutes.patch('/:id', validateBody(customerInputSchema), asyncHandler(customersController.updateCustomerHandler));
customersRoutes.delete('/:id', asyncHandler(customersController.deleteCustomerHandler));
