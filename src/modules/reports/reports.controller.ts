import type { Request, Response } from 'express';
import { ApiError } from '@/utils/apiError';
import * as reportsService from './reports.service';

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

function parseWarehouseId(req: Request): string | undefined {
  return typeof req.query.warehouseId === 'string' && req.query.warehouseId ? req.query.warehouseId : undefined;
}

export async function getSalesReportHandler(req: Request, res: Response) {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await reportsService.getSalesReport(requireUser(req), from, to, status, parseWarehouseId(req)));
}

export async function getPurchasesReportHandler(req: Request, res: Response) {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await reportsService.getPurchasesReport(requireUser(req), from, to, status, parseWarehouseId(req)));
}

export async function getInventoryReportHandler(req: Request, res: Response) {
  res.json(await reportsService.getInventoryReport(requireUser(req), parseWarehouseId(req)));
}

export async function getRecentSalesByProductHandler(req: Request, res: Response) {
  const rawDays = typeof req.query.days === 'string' ? Number(req.query.days) : NaN;
  const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 3;
  res.json(await reportsService.getRecentSalesByProduct(requireUser(req), days, parseWarehouseId(req)));
}
