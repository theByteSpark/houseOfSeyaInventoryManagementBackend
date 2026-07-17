import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import * as inventoryService from './inventory.service';

export async function listProductsHandler(_req: Request, res: Response) {
  res.json(await inventoryService.listProducts());
}

export async function getProductHandler(req: Request, res: Response) {
  res.json(await inventoryService.getProduct(requireParam(req, 'id')));
}

export async function createProductHandler(req: Request, res: Response) {
  res.status(201).json(await inventoryService.createProduct(req.body));
}

export async function updateProductHandler(req: Request, res: Response) {
  res.json(await inventoryService.updateProduct(requireParam(req, 'id'), req.body));
}

export async function deleteProductHandler(req: Request, res: Response) {
  await inventoryService.deleteProduct(requireParam(req, 'id'));
  res.status(204).send();
}

export async function restockProductHandler(req: Request, res: Response) {
  res.json(await inventoryService.restockProduct(requireParam(req, 'id'), req.body));
}

export async function listStockMovementsHandler(req: Request, res: Response) {
  res.json(await inventoryService.listStockMovements(requireParam(req, 'id')));
}

export async function listCategoriesHandler(_req: Request, res: Response) {
  res.json(await inventoryService.listCategories());
}

export async function createCategoryHandler(req: Request, res: Response) {
  res.status(201).json(await inventoryService.createCategory(req.body));
}

export async function deleteCategoryHandler(req: Request, res: Response) {
  await inventoryService.deleteCategory(requireParam(req, 'id'));
  res.status(204).send();
}
