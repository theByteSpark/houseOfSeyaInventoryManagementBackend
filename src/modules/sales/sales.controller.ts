import type { Request, Response } from 'express';
import type { SaleStatus } from '@prisma/client';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import { ApiError } from '@/utils/apiError';
import * as salesService from './sales.service';

const SALE_SORTABLE_FIELDS = ['saleNumber', 'customer', 'status', 'total', 'createdAt'];
const SALE_STATUSES: SaleStatus[] = ['OUTWARD_TRANSIT', 'DONE', 'CANCELLED'];

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

function parseStatusFilter(req: Request): SaleStatus | 'ALL' {
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  return SALE_STATUSES.includes(rawStatus as SaleStatus) ? (rawStatus as SaleStatus) : 'ALL';
}

function parseWarehouseId(req: Request): string | undefined {
  return typeof req.query.warehouseId === 'string' && req.query.warehouseId ? req.query.warehouseId : undefined;
}

export async function listSalesHandler(req: Request, res: Response) {
  const user = requireUser(req);
  if (!isPaginationRequested(req)) {
    res.json(await salesService.listSales(user, parseStatusFilter(req), parseWarehouseId(req)));
    return;
  }

  const params = parsePaginationParams(req, SALE_SORTABLE_FIELDS);
  res.json(await salesService.listSalesPaginated(user, params, parseStatusFilter(req), parseWarehouseId(req)));
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

export async function cancelSaleHandler(req: Request, res: Response) {
  res.json(await salesService.cancelSale(requireUser(req), requireParam(req, 'id')));
}

export async function completeSaleHandler(req: Request, res: Response) {
  res.json(await salesService.completeSale(requireUser(req), requireParam(req, 'id')));
}
