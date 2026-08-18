import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import * as vendorsService from './vendors.service';

const SORTABLE_FIELDS = ['companyName', 'contactPerson', 'email', 'phone', 'totalOrders', 'createdAt'];

export async function listVendorsHandler(req: Request, res: Response) {
  if (!isPaginationRequested(req)) {
    res.json(await vendorsService.listVendors());
    return;
  }

  const params = parsePaginationParams(req, SORTABLE_FIELDS);
  res.json(await vendorsService.listVendorsPaginated(params));
}

export async function getVendorHandler(req: Request, res: Response) {
  res.json(await vendorsService.getVendor(requireParam(req, 'id')));
}

export async function createVendorHandler(req: Request, res: Response) {
  res.status(201).json(await vendorsService.createVendor(req.body));
}

export async function updateVendorHandler(req: Request, res: Response) {
  res.json(await vendorsService.updateVendor(requireParam(req, 'id'), req.body));
}

export async function deleteVendorHandler(req: Request, res: Response) {
  await vendorsService.deleteVendor(requireParam(req, 'id'));
  res.status(204).send();
}
