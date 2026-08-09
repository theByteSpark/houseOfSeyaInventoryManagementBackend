import type { Request, Response } from 'express';
import type { PurchaseStatus } from '@prisma/client';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';
import * as purchasesService from './purchases.service';

const SORTABLE_FIELDS = ['purchaseNumber', 'vendor', 'status', 'createdAt'];
const PURCHASE_STATUSES: PurchaseStatus[] = [
  'DRAFT',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
];

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function listPurchasesHandler(req: Request, res: Response) {
  const user = requireUser(req);
  if (!isPaginationRequested(req)) {
    res.json(await purchasesService.listPurchases(user));
    return;
  }

  const params = parsePaginationParams(req, SORTABLE_FIELDS);
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  const statusFilter = PURCHASE_STATUSES.includes(rawStatus as PurchaseStatus)
    ? (rawStatus as PurchaseStatus)
    : 'ALL';
  const warehouseId = typeof req.query.warehouseId === 'string' && req.query.warehouseId ? req.query.warehouseId : undefined;
  res.json(await purchasesService.listPurchasesPaginated(user, params, statusFilter, warehouseId));
}

export async function getPurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.getPurchase(requireUser(req), requireParam(req, 'id')));
}

export async function createPurchaseHandler(req: Request, res: Response) {
  res.status(201).json(await purchasesService.createPurchase(requireUser(req), req.body));
}

export async function updatePurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.updatePurchase(requireUser(req), requireParam(req, 'id'), req.body));
}

export async function orderPurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.orderPurchase(requireUser(req), requireParam(req, 'id')));
}

export async function receivePurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.receivePurchaseItems(requireUser(req), requireParam(req, 'id'), req.body));
}

export async function cancelPurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.cancelPurchase(requireUser(req), requireParam(req, 'id')));
}
