import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import { ApiError } from '@/utils/apiError';
import * as controller from './import-export.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isCsv = file.mimetype === 'text/csv' || name.endsWith('.csv');
    const isExcel =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls');
    if (isCsv || isExcel) {
      cb(null, true);
    } else {
      cb(ApiError.badRequest('Only .csv, .xlsx, or .xls files are supported.'));
    }
  },
});

export const importExportRoutes = Router();

importExportRoutes.use(authenticate);

importExportRoutes.get('/products/template', asyncHandler(controller.getProductsTemplateHandler));
importExportRoutes.post('/products', upload.single('file'), asyncHandler(controller.importProductsHandler));

importExportRoutes.get('/customers/template', asyncHandler(controller.getCustomersTemplateHandler));
importExportRoutes.post('/customers', upload.single('file'), asyncHandler(controller.importCustomersHandler));

importExportRoutes.get('/vendors/template', asyncHandler(controller.getVendorsTemplateHandler));
importExportRoutes.post('/vendors', upload.single('file'), asyncHandler(controller.importVendorsHandler));

importExportRoutes.get('/sales/template', asyncHandler(controller.getSalesTemplateHandler));
importExportRoutes.post('/sales', upload.single('file'), asyncHandler(controller.importSalesHandler));

importExportRoutes.get('/purchases/template', asyncHandler(controller.getPurchasesTemplateHandler));
importExportRoutes.post('/purchases', upload.single('file'), asyncHandler(controller.importPurchasesHandler));
