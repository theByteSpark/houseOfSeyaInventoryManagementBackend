import type { Request, Response } from 'express';
import * as stockTransfersService from './stock-transfers.service';

export async function listTransfersHandler(_req: Request, res: Response) {
  res.json(await stockTransfersService.listTransfers());
}

export async function createTransferHandler(req: Request, res: Response) {
  res.status(201).json(await stockTransfersService.createTransfer(req.body));
}
