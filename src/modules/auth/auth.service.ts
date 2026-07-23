import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import {
  signAccessToken,
  signPasswordResetToken,
  signRefreshToken,
  verifyPasswordResetToken,
  verifyRefreshToken,
} from '@/utils/jwt';
import { sendPasswordResetEmail } from '@/utils/mailer';
import type { ForgotPasswordInput, LoginInput, ResetPasswordInput, VerifyResetCodeInput } from './auth.validation';

const SALT_ROUNDS = 10;

function toPublicUser(user: { id: string; name: string; email: string; role: 'ADMIN' | 'STAFF' }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function issueTokens(userId: string, role: 'ADMIN' | 'STAFF') {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId });
  const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { refreshToken: refreshTokenHash } });
  return { accessToken, refreshToken };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw ApiError.unauthorized('Invalid email or password.');

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) throw ApiError.unauthorized('Invalid email or password.');

  const tokens = await issueTokens(user.id, user.role);
  return { user: toPublicUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token.');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user?.refreshToken) throw ApiError.unauthorized('Session no longer valid.');

  const matches = await bcrypt.compare(refreshToken, user.refreshToken);
  if (!matches) throw ApiError.unauthorized('Session no longer valid.');

  const tokens = await issueTokens(user.id, user.role);
  return { user: toPublicUser(user), ...tokens };
}

export async function logout(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found.');
  return toPublicUser(user);
}

const RESET_CODE_TTL_MS = 10 * 60 * 1000;

function generateResetCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function forgotPassword(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Always respond success even if the user doesn't exist, to avoid leaking which emails are registered.
  if (!user) return;

  const code = generateResetCode();
  const codeHash = await bcrypt.hash(code, SALT_ROUNDS);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      codeHash,
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
    },
  });

  await sendPasswordResetEmail(user.email, code);
}

export async function verifyResetCode(input: VerifyResetCodeInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw ApiError.badRequest('Invalid or expired code.');

  const token = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!token) throw ApiError.badRequest('Invalid or expired code.');

  const matches = await bcrypt.compare(input.code, token.codeHash);
  if (!matches) throw ApiError.badRequest('Invalid or expired code.');

  await prisma.passwordResetToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });

  return { resetToken: signPasswordResetToken(user.id) };
}

export async function resetPassword(input: ResetPasswordInput) {
  let payload;
  try {
    payload = verifyPasswordResetToken(input.resetToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired reset session. Please request a new code.');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: payload.sub },
    data: { passwordHash, refreshToken: null },
  });
}
