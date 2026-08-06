import type { Request, Response } from 'express';
import * as authService from './auth.service';

export async function loginHandler(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  res.json({ user, accessToken, refreshToken });
}

export async function refreshHandler(req: Request, res: Response) {
  const { refreshToken: token } = req.body;
  const { user, accessToken, refreshToken } = await authService.refresh(token);
  res.json({ user, accessToken, refreshToken });
}

export async function logoutHandler(req: Request, res: Response) {
  if (req.user) await authService.logout(req.user.id);
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
