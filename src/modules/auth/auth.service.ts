import bcrypt from 'bcrypt';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '@/utils/jwt';
import type { LoginInput, RegisterInput } from './auth.validation';

const SALT_ROUNDS = 10;

function toPublicUser(user: { id: string; name: string; email: string; role: 'ADMIN' | 'STAFF' }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict('A user with this email already exists.');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role ?? 'STAFF',
    },
  });

  return toPublicUser(user);
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
