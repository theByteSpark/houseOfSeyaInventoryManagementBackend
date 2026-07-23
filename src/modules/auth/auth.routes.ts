import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as authController from './auth.controller';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, verifyResetCodeSchema } from './auth.validation';

export const authRoutes = Router();

authRoutes.post('/login', validateBody(loginSchema), asyncHandler(authController.loginHandler));
authRoutes.post('/refresh', asyncHandler(authController.refreshHandler));
authRoutes.post('/logout', authenticate, asyncHandler(authController.logoutHandler));
authRoutes.get('/me', authenticate, asyncHandler(authController.meHandler));

authRoutes.post(
  '/forgot-password',
  validateBody(forgotPasswordSchema),
  asyncHandler(authController.forgotPasswordHandler),
);
authRoutes.post(
  '/verify-reset-code',
  validateBody(verifyResetCodeSchema),
  asyncHandler(authController.verifyResetCodeHandler),
);
authRoutes.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  asyncHandler(authController.resetPasswordHandler),
);
