import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import { ApiError } from '@/utils/apiError';
import * as blockedQuantityService from './blocked-quantity.service';

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

const STATUSES = ['OPEN', 'CONFIRMED', 'CANCELLED'] as const;

function parseStatusFilter(req: Request): 'OPEN' | 'CONFIRMED' | 'CANCELLED' | 'ALL' {
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'OPEN';
  if (rawStatus === 'ALL') return 'ALL';
  return (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as 'OPEN' | 'CONFIRMED' | 'CANCELLED')
    : 'OPEN';
}

function parseWarehouseId(req: Request): string | undefined {
  const value = req.query.warehouseId;
  return typeof value === 'string' && value ? value : undefined;
}

function parseProductId(req: Request): string | undefined {
  const value = req.query.productId;
  return typeof value === 'string' && value ? value : undefined;
}

export async function listBlockedQuantitiesHandler(req: Request, res: Response) {
  const user = requireUser(req);
  res.json(
    await blockedQuantityService.listBlockedQuantities(
      user,
      parseStatusFilter(req),
      parseWarehouseId(req),
      parseProductId(req),
    ),
  );
}

export async function createBlockedQuantityHandler(req: Request, res: Response) {
  const user = requireUser(req);
  res.status(201).json(await blockedQuantityService.createBlockedQuantity(user, req.body));
}

export async function editBlockedQuantityHandler(req: Request, res: Response) {
  const user = requireUser(req);
  res.json(await blockedQuantityService.editBlockedQuantity(user, requireParam(req, 'id'), req.body));
}

export async function deleteBlockedQuantityHandler(req: Request, res: Response) {
  const user = requireUser(req);
  await blockedQuantityService.deleteBlockedQuantity(user, requireParam(req, 'id'));
  res.status(204).send();
}

export async function confirmBlockedQuantityHandler(req: Request, res: Response) {
  const user = requireUser(req);
  res.json(await blockedQuantityService.confirmBlockedQuantity(user, requireParam(req, 'id'), req.body));
}
