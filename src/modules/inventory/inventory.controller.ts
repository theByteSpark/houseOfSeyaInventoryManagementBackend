import type { Request, Response } from 'express';
import { requireParam } from '@/utils/params';
import { isPaginationRequested, parsePaginationParams } from '@/utils/pagination';
import * as inventoryService from './inventory.service';

const PRODUCT_SORTABLE_FIELDS = ['name', 'sku', 'category', 'unitPrice', 'quantityInStock', 'createdAt'];
const CATEGORY_SORTABLE_FIELDS = ['name', 'productCount'];

export async function listProductsHandler(req: Request, res: Response) {
  if (!isPaginationRequested(req)) {
    res.json(await inventoryService.listProducts());
    return;
  }

  const params = parsePaginationParams(req, PRODUCT_SORTABLE_FIELDS);
  const stockFilter = req.query.stockFilter === 'low' ? 'low' : 'all';
  res.json(await inventoryService.listProductsPaginated(params, stockFilter));
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

export async function listCategoriesHandler(req: Request, res: Response) {
  if (!isPaginationRequested(req)) {
    res.json(await inventoryService.listCategories());
    return;
  }

  const params = parsePaginationParams(req, CATEGORY_SORTABLE_FIELDS);
  res.json(await inventoryService.listCategoriesPaginated(params));
}

export async function createCategoryHandler(req: Request, res: Response) {
  res.status(201).json(await inventoryService.createCategory(req.body));
}

export async function updateCategoryHandler(req: Request, res: Response) {
  res.json(await inventoryService.updateCategory(requireParam(req, 'id'), req.body));
}

export async function deleteCategoryHandler(req: Request, res: Response) {
  await inventoryService.deleteCategory(requireParam(req, 'id'));
  res.status(204).send();
}
