import type { Request, Response } from 'express';
import * as reportsService from './reports.service';

export async function getSalesReportHandler(req: Request, res: Response) {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await reportsService.getSalesReport(from, to, status));
}

export async function getPurchasesReportHandler(req: Request, res: Response) {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await reportsService.getPurchasesReport(from, to, status));
}

export async function getInventoryReportHandler(_req: Request, res: Response) {
  res.json(await reportsService.getInventoryReport());
}
