import type { Request, Response } from 'express';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects } from '@/utils/csv';
import { parseExcel } from '@/utils/excel';
import { buildProductImportTemplate, importProducts } from './products.import';
import { buildCustomerImportTemplate, importCustomers } from './customers.import';
import { buildVendorImportTemplate, importVendors } from './vendors.import';
import { buildSalesImportTemplate, importSales } from './sales.import';
import { buildPurchasesImportTemplate, importPurchases } from './purchases.import';

async function requireUploadedRows(req: Request): Promise<Record<string, string>[]> {
  const file = req.file;
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

function isExcelFormat(req: Request): boolean {
  return req.query?.format === 'xlsx';
}

function sendTemplate(res: Response, format: 'csv' | 'xlsx', filenameBase: string, content: string | Buffer) {
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
  } else {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
  }
  res.send(content);
}

export async function getProductsTemplateHandler(req: Request, res: Response) {
  const format = isExcelFormat(req) ? 'xlsx' : 'csv';
  const content = await buildProductImportTemplate(format);
  sendTemplate(res, format, 'products-import-template', content);
}

export async function importProductsHandler(req: Request, res: Response) {
  const rows = await requireUploadedRows(req);
  const result = await importProducts(rows);
  res.json(result);
}

export async function getCustomersTemplateHandler(req: Request, res: Response) {
  const format = isExcelFormat(req) ? 'xlsx' : 'csv';
  const content = await buildCustomerImportTemplate(format);
  sendTemplate(res, format, 'customers-import-template', content);
}

export async function importCustomersHandler(req: Request, res: Response) {
  const rows = await requireUploadedRows(req);
  const result = await importCustomers(rows);
  res.json(result);
}

export async function getVendorsTemplateHandler(req: Request, res: Response) {
  const format = isExcelFormat(req) ? 'xlsx' : 'csv';
  const content = await buildVendorImportTemplate(format);
  sendTemplate(res, format, 'vendors-import-template', content);
}

export async function importVendorsHandler(req: Request, res: Response) {
  const rows = await requireUploadedRows(req);
  const result = await importVendors(rows);
  res.json(result);
}

export async function getSalesTemplateHandler(req: Request, res: Response) {
  const format = isExcelFormat(req) ? 'xlsx' : 'csv';
  const content = await buildSalesImportTemplate(format);
  sendTemplate(res, format, 'sales-import-template', content);
}

export async function importSalesHandler(req: Request, res: Response) {
  const rows = await requireUploadedRows(req);
  const result = await importSales(rows);
  res.json(result);
}

export async function getPurchasesTemplateHandler(req: Request, res: Response) {
  const format = isExcelFormat(req) ? 'xlsx' : 'csv';
  const content = await buildPurchasesImportTemplate(format);
  sendTemplate(res, format, 'purchases-import-template', content);
}

export async function importPurchasesHandler(req: Request, res: Response) {
  const rows = await requireUploadedRows(req);
  const result = await importPurchases(rows);
  res.json(result);
}
