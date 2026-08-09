import type { Request, Response } from 'express';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects } from '@/utils/csv';
import { parseExcel } from '@/utils/excel';
import { buildProductImportTemplate, importProducts } from './products.import';
import { buildSalesImportTemplate, importSales } from './sales.import';
import { buildPurchasesImportTemplate, importPurchases } from './purchases.import';

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

async function requireUploadedRows(req: Request): Promise<Record<string, string>[]> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw ApiError.badRequest('No file uploaded.');

  const name = file.originalname.toLowerCase();
  const isExcel =
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimetype === 'application/vnd.ms-excel';

  if (isExcel) {
    return parseExcel(file.buffer);
  }
  return parseCsvObjects(file.buffer.toString('utf-8'));
}

function optionalWarehouseId(req: Request): string | undefined {
  const value = req.body?.warehouseId;
  return typeof value === 'string' && value ? value : undefined;
}

function isExcelFormat(req: Request): boolean {
  return req.query?.format === 'xlsx';
}

export async function getProductsTemplateHandler(req: Request, res: Response) {
  if (isExcelFormat(req)) {
    const buffer = await buildProductImportTemplate('xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="products-import-template.xlsx"');
    res.send(buffer);
    return;
  }
  const csv = buildProductImportTemplate('csv');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products-import-template.csv"');
  res.send(csv);
}

export async function importProductsHandler(req: Request, res: Response) {
  const rows = await requireUploadedRows(req);
  const result = await importProducts(requireUser(req), rows, optionalWarehouseId(req));
  res.json(result);
}

export async function getSalesTemplateHandler(req: Request, res: Response) {
  if (isExcelFormat(req)) {
    const buffer = await buildSalesImportTemplate('xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-import-template.xlsx"');
    res.send(buffer);
    return;
  }
  const csv = buildSalesImportTemplate('csv');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sales-import-template.csv"');
  res.send(csv);
}

export async function importSalesHandler(req: Request, res: Response) {
  const rows = await requireUploadedRows(req);
  const result = await importSales(requireUser(req), rows, optionalWarehouseId(req));
  res.json(result);
}

export async function getPurchasesTemplateHandler(req: Request, res: Response) {
  if (isExcelFormat(req)) {
    const buffer = await buildPurchasesImportTemplate('xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="purchases-import-template.xlsx"');
    res.send(buffer);
    return;
  }
  const csv = buildPurchasesImportTemplate('csv');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="purchases-import-template.csv"');
  res.send(csv);
}

export async function importPurchasesHandler(req: Request, res: Response) {
  const rows = await requireUploadedRows(req);
  const result = await importPurchases(requireUser(req), rows, optionalWarehouseId(req));
  res.json(result);
}
