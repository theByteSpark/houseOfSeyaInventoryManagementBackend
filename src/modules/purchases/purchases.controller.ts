import type { Request, Response } from 'express';
import type { PurchaseStatus } from '@prisma/client';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import * as purchasesService from './purchases.service';

const SORTABLE_FIELDS = ['purchaseNumber', 'vendor', 'status', 'createdAt'];
const PURCHASE_STATUSES: PurchaseStatus[] = [
  'DRAFT',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
];

export async function listPurchasesHandler(req: Request, res: Response) {
  if (!isPaginationRequested(req)) {
    res.json(await purchasesService.listPurchases());
    return;
  }

  const params = parsePaginationParams(req, SORTABLE_FIELDS);
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  const statusFilter = PURCHASE_STATUSES.includes(rawStatus as PurchaseStatus)
    ? (rawStatus as PurchaseStatus)
    : 'ALL';
  res.json(await purchasesService.listPurchasesPaginated(params, statusFilter));
}

export async function getPurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.getPurchase(requireParam(req, 'id')));
}

export async function createPurchaseHandler(req: Request, res: Response) {
  res.status(201).json(await purchasesService.createPurchase(req.body));
}

export async function updatePurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.updatePurchase(requireParam(req, 'id'), req.body));
}

export async function orderPurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.orderPurchase(requireParam(req, 'id')));
}

export async function receivePurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.receivePurchaseItems(requireParam(req, 'id'), req.body));
}

export async function cancelPurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.cancelPurchase(requireParam(req, 'id')));
}
