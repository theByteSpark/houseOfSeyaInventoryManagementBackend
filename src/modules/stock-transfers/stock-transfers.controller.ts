import type { Request, Response } from 'express';
import { ApiError } from '@/utils/apiError';
import * as stockTransfersService from './stock-transfers.service';

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function listTransfersHandler(_req: Request, res: Response) {
  res.json(await stockTransfersService.listTransfers());
}

export async function createTransferHandler(req: Request, res: Response) {
  res.status(201).json(await stockTransfersService.createTransfer(requireUser(req), req.body));
}
