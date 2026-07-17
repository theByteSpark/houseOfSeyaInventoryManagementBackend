import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import * as invoicesService from './invoices.service';

export async function listInvoicesHandler(_req: Request, res: Response) {
  res.json(await invoicesService.listInvoices());
}

export async function getInvoiceHandler(req: Request, res: Response) {
  res.json(await invoicesService.getInvoice(requireParam(req, 'id')));
}

export async function createInvoiceHandler(req: Request, res: Response) {
  res.status(201).json(await invoicesService.createInvoice(req.body));
}

export async function issueInvoiceHandler(req: Request, res: Response) {
  res.json(await invoicesService.issueInvoice(requireParam(req, 'id')));
}

export async function markInvoicePaidHandler(req: Request, res: Response) {
  res.json(await invoicesService.markInvoicePaid(requireParam(req, 'id')));
}

export async function cancelInvoiceHandler(req: Request, res: Response) {
  res.json(await invoicesService.cancelInvoice(requireParam(req, 'id')));
}
