import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { validateBody } from '@/middleware/validate';
import * as inventoryController from './inventory.controller';
import { categoryInputSchema, productInputSchema, restockInputSchema } from './inventory.validation';

export const inventoryRoutes = Router();

inventoryRoutes.use(authenticate);

inventoryRoutes.get('/products', asyncHandler(inventoryController.listProductsHandler));
inventoryRoutes.get('/products/:id', asyncHandler(inventoryController.getProductHandler));
inventoryRoutes.post('/products', validateBody(productInputSchema), asyncHandler(inventoryController.createProductHandler));
inventoryRoutes.patch('/products/:id', validateBody(productInputSchema), asyncHandler(inventoryController.updateProductHandler));
inventoryRoutes.delete('/products/:id', asyncHandler(inventoryController.deleteProductHandler));
inventoryRoutes.post(
  '/products/:id/restock',
  validateBody(restockInputSchema),
  asyncHandler(inventoryController.restockProductHandler),
);
inventoryRoutes.get('/products/:id/movements', asyncHandler(inventoryController.listStockMovementsHandler));

inventoryRoutes.get('/categories', asyncHandler(inventoryController.listCategoriesHandler));
inventoryRoutes.post('/categories', validateBody(categoryInputSchema), asyncHandler(inventoryController.createCategoryHandler));
inventoryRoutes.patch('/categories/:id', validateBody(categoryInputSchema), asyncHandler(inventoryController.updateCategoryHandler));
inventoryRoutes.delete('/categories/:id', asyncHandler(inventoryController.deleteCategoryHandler));
