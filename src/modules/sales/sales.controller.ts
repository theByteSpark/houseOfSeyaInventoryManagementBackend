import type { Request, Response } from 'express';
import type { SaleStatus } from '@prisma/client';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';
import * as salesService from './sales.service';

const SALE_SORTABLE_FIELDS = ['saleNumber', 'customer', 'status', 'total', 'createdAt'];
const SALE_STATUSES: SaleStatus[] = ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED'];

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function listSalesHandler(req: Request, res: Response) {
  const user = requireUser(req);
  if (!isPaginationRequested(req)) {
    res.json(await salesService.listSales(user));
    return;
  }

  const params = parsePaginationParams(req, SALE_SORTABLE_FIELDS);
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  const statusFilter = SALE_STATUSES.includes(rawStatus as SaleStatus) ? (rawStatus as SaleStatus) : 'ALL';
  const warehouseId = typeof req.query.warehouseId === 'string' && req.query.warehouseId ? req.query.warehouseId : undefined;
  res.json(await salesService.listSalesPaginated(user, params, statusFilter, warehouseId));
}

export async function getSaleHandler(req: Request, res: Response) {
  res.json(await salesService.getSale(requireUser(req), requireParam(req, 'id')));
}

export async function createSaleHandler(req: Request, res: Response) {
  res.status(201).json(await salesService.createSale(requireUser(req), req.body));
}

export async function updateSaleHandler(req: Request, res: Response) {
  res.json(await salesService.updateSale(requireUser(req), requireParam(req, 'id'), req.body));
}

export async function issueSaleHandler(req: Request, res: Response) {
  res.json(await salesService.issueSale(requireUser(req), requireParam(req, 'id')));
}

export async function markSalePaidHandler(req: Request, res: Response) {
  res.json(await salesService.markSalePaid(requireUser(req), requireParam(req, 'id')));
}

export async function cancelSaleHandler(req: Request, res: Response) {
  res.json(await salesService.cancelSale(requireUser(req), requireParam(req, 'id')));
}
