import type { Request, Response } from 'express';
import { ApiError } from '@/utils/apiError';
import { buildProductImportTemplate, importProductsCsv } from './products.import';
import { buildSalesImportTemplate, importSalesCsv } from './sales.import';
import { buildPurchasesImportTemplate, importPurchasesCsv } from './purchases.import';
import { buildCustomersImportTemplate, importCustomersCsv } from './customers.import';
import { buildVendorsImportTemplate, importVendorsCsv } from './vendors.import';

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

function requireUploadedFile(req: Request): string {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw ApiError.badRequest('No file uploaded.');
  return file.buffer.toString('utf-8');
}

function optionalWarehouseId(req: Request): string | undefined {
  const value = req.body?.warehouseId;
  return typeof value === 'string' && value ? value : undefined;
}

export function getProductsTemplateHandler(_req: Request, res: Response) {
  const csv = buildProductImportTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products-import-template.csv"');
  res.send(csv);
}

export async function importProductsHandler(req: Request, res: Response) {
  const csv = requireUploadedFile(req);
  const result = await importProductsCsv(requireUser(req), csv, optionalWarehouseId(req));
  res.json(result);
}

export function getSalesTemplateHandler(_req: Request, res: Response) {
  const csv = buildSalesImportTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sales-import-template.csv"');
  res.send(csv);
}

export async function importSalesHandler(req: Request, res: Response) {
  const csv = requireUploadedFile(req);
  const result = await importSalesCsv(requireUser(req), csv, optionalWarehouseId(req));
  res.json(result);
}

export function getPurchasesTemplateHandler(_req: Request, res: Response) {
  const csv = buildPurchasesImportTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="purchases-import-template.csv"');
  res.send(csv);
}

export async function importPurchasesHandler(req: Request, res: Response) {
  const csv = requireUploadedFile(req);
  const result = await importPurchasesCsv(requireUser(req), csv, optionalWarehouseId(req));
  res.json(result);
}

export function getCustomersTemplateHandler(_req: Request, res: Response) {
  const csv = buildCustomersImportTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="customers-import-template.csv"');
  res.send(csv);
}

export async function importCustomersHandler(req: Request, res: Response) {
  requireUser(req);
  const csv = requireUploadedFile(req);
  const result = await importCustomersCsv(csv);
  res.json(result);
}

export function getVendorsTemplateHandler(_req: Request, res: Response) {
  const csv = buildVendorsImportTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="vendors-import-template.csv"');
  res.send(csv);
}

export async function importVendorsHandler(req: Request, res: Response) {
  requireUser(req);
  const csv = requireUploadedFile(req);
  const result = await importVendorsCsv(csv);
  res.json(result);
}
