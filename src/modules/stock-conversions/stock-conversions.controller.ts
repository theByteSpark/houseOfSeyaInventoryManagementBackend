import type { Request, Response } from 'express';
import { ApiError } from '@/utils/apiError';
import * as stockConversionsService from './stock-conversions.service';

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function listConversionsHandler(req: Request, res: Response) {
  res.json(await stockConversionsService.listConversions(requireUser(req)));
}

export async function createConversionHandler(req: Request, res: Response) {
  res.status(201).json(await stockConversionsService.createConversion(requireUser(req), req.body));
}
