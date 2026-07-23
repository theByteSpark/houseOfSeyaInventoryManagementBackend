import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import * as customersService from './customers.service';

const SORTABLE_FIELDS = ['name', 'email', 'phone', 'totalSales', 'createdAt'];

export async function listCustomersHandler(req: Request, res: Response) {
  if (!isPaginationRequested(req)) {
    res.json(await customersService.listCustomers());
    return;
  }

  const params = parsePaginationParams(req, SORTABLE_FIELDS);
  res.json(await customersService.listCustomersPaginated(params));
}

export async function getCustomerHandler(req: Request, res: Response) {
  res.json(await customersService.getCustomer(requireParam(req, 'id')));
}

export async function createCustomerHandler(req: Request, res: Response) {
  res.status(201).json(await customersService.createCustomer(req.body));
}

export async function updateCustomerHandler(req: Request, res: Response) {
  res.json(await customersService.updateCustomer(requireParam(req, 'id'), req.body));
}

export async function deleteCustomerHandler(req: Request, res: Response) {
  await customersService.deleteCustomer(requireParam(req, 'id'));
  res.status(204).send();
}
