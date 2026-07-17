import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validateBody } from '@/middleware/validate';
import * as usersController from './users.controller';
import { updateUserSchema } from './users.validation';

export const usersRoutes = Router();

usersRoutes.use(authenticate, authorize('ADMIN'));

usersRoutes.get('/', asyncHandler(usersController.listUsersHandler));
usersRoutes.get('/:id', asyncHandler(usersController.getUserHandler));
usersRoutes.patch('/:id', validateBody(updateUserSchema), asyncHandler(usersController.updateUserHandler));
usersRoutes.delete('/:id', asyncHandler(usersController.deleteUserHandler));
