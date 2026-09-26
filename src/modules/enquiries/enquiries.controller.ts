import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import * as enquiriesService from './enquiries.service';

const SORTABLE_FIELDS = ['customer', 'subcategory', 'metalType', 'grossWeight', 'createdAt'];

export async function listEnquiriesHandler(req: Request, res: Response) {
  if (!isPaginationRequested(req)) {
    res.json(await enquiriesService.listEnquiries());
    return;
  }

  const params = parsePaginationParams(req, SORTABLE_FIELDS);
  res.json(await enquiriesService.listEnquiriesPaginated(params));
}

export async function getEnquiryHandler(req: Request, res: Response) {
  res.json(await enquiriesService.getEnquiry(requireParam(req, 'id')));
}

export async function createEnquiryHandler(req: Request, res: Response) {
  res.status(201).json(await enquiriesService.createEnquiry(req.body));
}

export async function updateEnquiryHandler(req: Request, res: Response) {
  res.json(await enquiriesService.updateEnquiry(requireParam(req, 'id'), req.body));
}

export async function deleteEnquiryHandler(req: Request, res: Response) {
  await enquiriesService.deleteEnquiry(requireParam(req, 'id'));
  res.status(204).send();
}
