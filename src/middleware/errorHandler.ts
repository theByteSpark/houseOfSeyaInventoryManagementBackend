import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { ApiError } from '@/utils/apiError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err instanceof Error && err.message === 'Only .csv files are supported.') {
    return res.status(400).json({ error: err.message });
  }

  // Fallback net for raw Prisma errors that a service didn't pre-validate
  // against (e.g. a unique-number race, or an FK dependency check that
  // wasn't added yet) — surfaces a clear 4xx instead of a bare 500.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A record with this value already exists.' });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ error: 'This action is blocked by related records.' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found.' });
    }
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}
