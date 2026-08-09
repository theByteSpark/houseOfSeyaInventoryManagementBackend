import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import * as warehousesService from './warehouses.service';

const SORTABLE_FIELDS = ['name', 'code', 'isActive', 'createdAt'];

export async function listWarehousesHandler(req: Request, res: Response) {
  if (!isPaginationRequested(req)) {
    res.json(await warehousesService.listWarehouses());
    return;
  }

  const params = parsePaginationParams(req, SORTABLE_FIELDS);
  res.json(await warehousesService.listWarehousesPaginated(params));
}

export async function getWarehouseHandler(req: Request, res: Response) {
  res.json(await warehousesService.getWarehouse(requireParam(req, 'id')));
}

export async function createWarehouseHandler(req: Request, res: Response) {
  res.status(201).json(await warehousesService.createWarehouse(req.body));
}

export async function updateWarehouseHandler(req: Request, res: Response) {
  res.json(await warehousesService.updateWarehouse(requireParam(req, 'id'), req.body));
}

export async function deleteWarehouseHandler(req: Request, res: Response) {
  await warehousesService.deleteWarehouse(requireParam(req, 'id'));
  res.status(204).send();
}
