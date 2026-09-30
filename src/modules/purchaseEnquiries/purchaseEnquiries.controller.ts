import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import * as purchaseEnquiriesService from './purchaseEnquiries.service';

const SORTABLE_FIELDS = ['vendor', 'subcategory', 'metalType', 'grossWeight', 'createdAt'];

export async function listPurchaseEnquiriesHandler(req: Request, res: Response) {
  if (!isPaginationRequested(req)) {
    res.json(await purchaseEnquiriesService.listPurchaseEnquiries());
    return;
  }

  const params = parsePaginationParams(req, SORTABLE_FIELDS);
  res.json(await purchaseEnquiriesService.listPurchaseEnquiriesPaginated(params));
}

export async function getPurchaseEnquiryHandler(req: Request, res: Response) {
  res.json(await purchaseEnquiriesService.getPurchaseEnquiry(requireParam(req, 'id')));
}

export async function createPurchaseEnquiryHandler(req: Request, res: Response) {
  res.status(201).json(await purchaseEnquiriesService.createPurchaseEnquiry(req.body));
}

export async function updatePurchaseEnquiryHandler(req: Request, res: Response) {
  res.json(await purchaseEnquiriesService.updatePurchaseEnquiry(requireParam(req, 'id'), req.body));
}

export async function deletePurchaseEnquiryHandler(req: Request, res: Response) {
  await purchaseEnquiriesService.deletePurchaseEnquiry(requireParam(req, 'id'));
  res.status(204).send();
}
