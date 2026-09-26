import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { toCsv } from '@/utils/csv';
import { buildExcelTemplate } from '@/utils/excel';
import { nextPurchaseNumber } from '@/modules/purchases/purchases.service';

// One row = one purchase with exactly one line item. Grouping several rows
// into a single multi-line purchase is out of scope for this import.
const TEMPLATE_HEADERS = ['vendorName', 'designNumber', 'quantity', 'unitCost', 'vendorInvoiceNumber', 'vendorInvoiceDate'];
const TEMPLATE_SAMPLE_ROWS: (string | number)[][] = [
  ['Atelier Moreau', 'RNG-ENG-001', '10', '55000', 'INV-2044', '2026-09-01'],
  ['Cascade Studio', 'NCK-CHN-010', '5', '78000', '', ''],
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

export async function importPurchases(
  rows: Record<string, string>[],
): Promise<{ results: ImportRowResult[]; createdCount: number; errorCount: number }> {
  if (rows.length === 0) {
    throw ApiError.badRequest('The uploaded file has no data rows.');
  }

  const results: ImportRowResult[] = [];
  let createdCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const raw = rows[i];

    try {
      const vendorName = raw.vendorName?.trim();
      if (!vendorName) throw new Error('vendorName is required');

      const designNumber = raw.designNumber?.trim();
      if (!designNumber) throw new Error('designNumber is required');

      const quantity = Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');

      const unitCost = Number(raw.unitCost);
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('unitCost must be a non-negative number');

      const vendorInvoiceNumber = raw.vendorInvoiceNumber?.trim() || null;
      const vendorInvoiceDateRaw = raw.vendorInvoiceDate?.trim();
      const vendorInvoiceDate = vendorInvoiceDateRaw ? new Date(vendorInvoiceDateRaw) : null;
      if (vendorInvoiceDate && Number.isNaN(vendorInvoiceDate.getTime())) {
        throw new Error('vendorInvoiceDate must be a valid date');
      }

      const vendor = await prisma.vendor.findFirst({
        where: { companyName: { equals: vendorName, mode: 'insensitive' } },
      });
      if (!vendor) throw new Error(`No vendor found with name "${vendorName}"`);

      const product = await prisma.product.findUnique({ where: { designNumber } });
      if (!product) throw new Error(`No product found with design number ${designNumber}`);

      const lineTotal = Math.round(unitCost * quantity * 100) / 100;
      const purchaseNumber = await nextPurchaseNumber();

      const purchase = await prisma.purchase.create({
        data: {
          purchaseNumber,
          vendorId: vendor.id,
          status: 'DRAFT',
          vendorInvoiceNumber,
          vendorInvoiceDate,
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
