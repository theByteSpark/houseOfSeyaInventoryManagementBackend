import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { verifyAccessToken } from '@/utils/jwt';

export interface AuthenticatedUser {
  id: string;
  role: Role;
  warehouseId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing access token');
  }

  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    console.error('authenticate: token verification failed', err);
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  const mapping = await prisma.userWarehouse.findUnique({
    where: { userId: payload.sub },
    select: { warehouseId: true },
  });
  req.user = { id: payload.sub, role: payload.role, warehouseId: mapping?.warehouseId ?? null };
  next();
}
