import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '@/utils/apiError';
import { logger } from '@/utils/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const context = `${req.method} ${req.originalUrl}`;

  if (err instanceof ApiError) {
    logger.warn(`[${context}] ApiError ${err.status}: ${err.message}`);
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    logger.warn(`[${context}] Validation failed: ${JSON.stringify(err.flatten().fieldErrors)}`);
    return res.status(400).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
  }

  logger.error(`[${context}] Unhandled error:`, err);
  return res.status(500).json({ error: 'Internal server error' });
}
