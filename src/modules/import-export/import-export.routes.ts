import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import * as controller from './import-export.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only .csv files are supported.'));
    }
  },
});

export const importExportRoutes = Router();

importExportRoutes.use(authenticate);

importExportRoutes.get('/products/template', controller.getProductsTemplateHandler);
importExportRoutes.post('/products', upload.single('file'), asyncHandler(controller.importProductsHandler));

importExportRoutes.get('/sales/template', controller.getSalesTemplateHandler);
importExportRoutes.post('/sales', upload.single('file'), asyncHandler(controller.importSalesHandler));

importExportRoutes.get('/purchases/template', controller.getPurchasesTemplateHandler);
importExportRoutes.post('/purchases', upload.single('file'), asyncHandler(controller.importPurchasesHandler));
