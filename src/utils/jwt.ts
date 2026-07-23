import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import type { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions);
}

export function signRefreshToken(payload: { sub: string }): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
}

export interface PasswordResetTokenPayload {
  sub: string;
  purpose: 'password-reset';
}

export function signPasswordResetToken(userId: string): string {
  const payload: PasswordResetTokenPayload = { sub: userId, purpose: 'password-reset' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
}

export function verifyPasswordResetToken(token: string): PasswordResetTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as PasswordResetTokenPayload;
  if (payload.purpose !== 'password-reset') {
    throw new Error('Invalid token purpose.');
  }
  return payload;
}
