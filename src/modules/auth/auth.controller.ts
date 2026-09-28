import type { Request, Response } from 'express';
import { env } from '@/config/env';
import * as authService from './auth.service';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const isProd = env.NODE_ENV === 'production';

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });
}

export async function loginHandler(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  setRefreshCookie(res, refreshToken);
  res.json({ user, accessToken });
}

export async function refreshHandler(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  const { user, accessToken, refreshToken } = await authService.refresh(token);
  setRefreshCookie(res, refreshToken);
  res.json({ user, accessToken });
}

export async function logoutHandler(req: Request, res: Response) {
  if (req.user) await authService.logout(req.user.id);
  clearRefreshCookie(res);
  res.status(204).send();
}

export async function meHandler(req: Request, res: Response) {
  const user = await authService.getCurrentUser(req.user!.id);
  res.json(user);
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  await authService.forgotPassword(req.body);
  res.status(204).send();
}

export async function verifyResetCodeHandler(req: Request, res: Response) {
  const result = await authService.verifyResetCode(req.body);
  res.json(result);
}

export async function resetPasswordHandler(req: Request, res: Response) {
  await authService.resetPassword(req.body);
  res.status(204).send();
}
