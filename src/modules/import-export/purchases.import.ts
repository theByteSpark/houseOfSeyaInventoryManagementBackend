import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { toCsv } from '@/utils/csv';
import { buildExcelTemplate } from '@/utils/excel';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { requireWarehouseId } from '@/utils/warehouseScope';

const TEMPLATE_HEADERS = ['vendorName', 'sku', 'quantity', 'unitCost'];
const TEMPLATE_SAMPLE_ROWS: (string | number)[][] = [
  ['Atelier Moreau', 'FAB-COT-001', '100', '6.50'],
  ['Cascade Studio', 'TRM-ZIP-021', '20', '11.00'],
];

export async function buildPurchasesImportTemplate(format: 'csv' | 'xlsx'): Promise<string | Buffer> {
  if (format === 'xlsx') {
    return buildExcelTemplate(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
  }
  return toCsv(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
}

interface ImportRowResult {
  row: number;
  purchaseNumber?: string;
  status: 'created' | 'error';
  message?: string;
}

async function nextPurchaseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.purchase.count();
  return `PO-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function importPurchases(
  user: AuthenticatedUser,
  rows: Record<string, string>[],
  warehouseIdInput?: string,
): Promise<{ results: ImportRowResult[]; createdCount: number; errorCount: number }> {
  if (rows.length === 0) {
    throw ApiError.badRequest('The uploaded file has no data rows.');
  }

  const warehouseId = requireWarehouseId(user, warehouseIdInput);

  const results: ImportRowResult[] = [];
  let createdCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const raw = rows[i];

    try {
      const vendorName = raw.vendorName?.trim();
      if (!vendorName) throw new Error('vendorName is required');

      const sku = raw.sku?.trim();
      if (!sku) throw new Error('sku is required');

      const quantity = Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');

      const unitCost = Number(raw.unitCost);
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('unitCost must be a non-negative number');

      const vendor = await prisma.vendor.findFirst({
        where: { companyName: { equals: vendorName, mode: 'insensitive' } },
      });
      if (!vendor) throw new Error(`No vendor found with name "${vendorName}"`);

      const product = await prisma.product.findUnique({ where: { sku } });
      if (!product) throw new Error(`No product found with SKU ${sku}`);

      const lineTotal = Math.round(unitCost * quantity * 100) / 100;
      const purchaseNumber = await nextPurchaseNumber();

      const purchase = await prisma.purchase.create({
        data: {
          purchaseNumber,
          vendorId: vendor.id,
          warehouseId,
          status: 'DRAFT',
          items: {
            create: [{ productId: product.id, quantity, receivedQuantity: 0, unitCost, lineTotal }],
          },
        },
      });

      createdCount++;
      results.push({ row: rowNum, purchaseNumber: purchase.purchaseNumber, status: 'created' });
    } catch (err) {
      errorCount++;
      results.push({
        row: rowNum,
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { results, createdCount, errorCount };
}
