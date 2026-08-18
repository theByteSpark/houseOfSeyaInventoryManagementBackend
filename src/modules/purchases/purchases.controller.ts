import type { Request, Response } from 'express';
import type { PurchaseStatus } from '@prisma/client';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';
import * as purchasesService from './purchases.service';

const SORTABLE_FIELDS = ['purchaseNumber', 'vendor', 'status', 'createdAt'];
const PURCHASE_STATUSES: PurchaseStatus[] = ['ORDERED', 'INWARD_TRANSIT', 'IN_STOCK', 'CANCELLED'];

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

function parseStatusFilter(req: Request): PurchaseStatus | 'ALL' {
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  return PURCHASE_STATUSES.includes(rawStatus as PurchaseStatus) ? (rawStatus as PurchaseStatus) : 'ALL';
}

function parseWarehouseId(req: Request): string | undefined {
  return typeof req.query.warehouseId === 'string' && req.query.warehouseId ? req.query.warehouseId : undefined;
}

export async function listPurchasesHandler(req: Request, res: Response) {
  const user = requireUser(req);
  if (!isPaginationRequested(req)) {
    res.json(await purchasesService.listPurchases(user, parseStatusFilter(req), parseWarehouseId(req)));
    return;
  }

  const params = parsePaginationParams(req, SORTABLE_FIELDS);
  res.json(await purchasesService.listPurchasesPaginated(user, params, parseStatusFilter(req), parseWarehouseId(req)));
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

export async function inwardTransitPurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.markPurchaseInwardTransit(requireUser(req), requireParam(req, 'id')));
}

export async function inStockPurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.markPurchaseInStock(requireUser(req), requireParam(req, 'id')));
}

export async function cancelPurchaseHandler(req: Request, res: Response) {
  res.json(await purchasesService.cancelPurchase(requireUser(req), requireParam(req, 'id')));
}
