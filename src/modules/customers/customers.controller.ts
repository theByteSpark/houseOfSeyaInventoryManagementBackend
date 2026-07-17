import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import * as customersService from './customers.service';

export async function listCustomersHandler(_req: Request, res: Response) {
  res.json(await customersService.listCustomers());
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
