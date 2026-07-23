import type { Request, Response } from 'express';
import type { SaleStatus } from '@prisma/client';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import * as salesService from './sales.service';
import { generateInvoicePdf } from './sales.pdf';

const SALE_SORTABLE_FIELDS = ['saleNumber', 'customer', 'status', 'total', 'createdAt'];
const SALE_STATUSES: SaleStatus[] = ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED'];

export async function listSalesHandler(req: Request, res: Response) {
  if (!isPaginationRequested(req)) {
    res.json(await salesService.listSales());
    return;
  }

  const params = parsePaginationParams(req, SALE_SORTABLE_FIELDS);
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  const statusFilter = SALE_STATUSES.includes(rawStatus as SaleStatus) ? (rawStatus as SaleStatus) : 'ALL';
  res.json(await salesService.listSalesPaginated(params, statusFilter));
}

export async function getSaleHandler(req: Request, res: Response) {
  res.json(await salesService.getSale(requireParam(req, 'id')));
}

export async function createSaleHandler(req: Request, res: Response) {
  res.status(201).json(await salesService.createSale(req.body));
}

export async function updateSaleHandler(req: Request, res: Response) {
  res.json(await salesService.updateSale(requireParam(req, 'id'), req.body));
}

export async function issueSaleHandler(req: Request, res: Response) {
  res.json(await salesService.issueSale(requireParam(req, 'id')));
}

export async function markSalePaidHandler(req: Request, res: Response) {
  res.json(await salesService.markSalePaid(requireParam(req, 'id')));
}

export async function cancelSaleHandler(req: Request, res: Response) {
  res.json(await salesService.cancelSale(requireParam(req, 'id')));
}

export async function getInvoicePdfHandler(req: Request, res: Response) {
  const id = requireParam(req, 'id');
  const { doc, saleNumber } = await generateInvoicePdf(id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${saleNumber}.pdf"`);
  doc.pipe(res);
}
