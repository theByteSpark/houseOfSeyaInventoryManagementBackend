import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as authController from './auth.controller';
import { loginSchema, registerSchema } from './auth.validation';

export const authRoutes = Router();

authRoutes.post('/register', validateBody(registerSchema), asyncHandler(authController.registerHandler));
authRoutes.post('/login', validateBody(loginSchema), asyncHandler(authController.loginHandler));
authRoutes.post('/refresh', asyncHandler(authController.refreshHandler));
authRoutes.post('/logout', authenticate, asyncHandler(authController.logoutHandler));
authRoutes.get('/me', authenticate, asyncHandler(authController.meHandler));
