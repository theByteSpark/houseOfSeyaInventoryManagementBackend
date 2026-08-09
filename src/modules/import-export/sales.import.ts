import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { toCsv } from '@/utils/csv';
import { buildExcelTemplate } from '@/utils/excel';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { requireWarehouseId } from '@/utils/warehouseScope';

const TEMPLATE_HEADERS = ['customerEmail', 'sku', 'quantity', 'taxRate'];
const TEMPLATE_SAMPLE_ROWS: (string | number)[][] = [
  ['orders@ateliermoreau.fr', 'FAB-COT-001', '10', '0.1'],
  ['hello@cascadestudio.com', 'TRM-ZIP-021', '2', ''],
];

export async function buildSalesImportTemplate(format: 'csv' | 'xlsx'): Promise<string | Buffer> {
  if (format === 'xlsx') {
    return buildExcelTemplate(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
  }
  return toCsv(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
}

interface ImportRowResult {
  row: number;
  saleNumber?: string;
  status: 'created' | 'error';
  message?: string;
}

async function nextSaleNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.sale.count();
  return `SALE-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function importSales(
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
      const customerEmail = raw.customerEmail?.trim();
      if (!customerEmail) throw new Error('customerEmail is required');

      const sku = raw.sku?.trim();
      if (!sku) throw new Error('sku is required');

      const quantity = Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');

      const taxRate = raw.taxRate ? Number(raw.taxRate) : 0.1;
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) throw new Error('taxRate must be between 0 and 1');

      const customer = await prisma.customer.findFirst({ where: { email: customerEmail } });
      if (!customer) throw new Error(`No customer found with email ${customerEmail}`);

      const product = await prisma.product.findUnique({ where: { sku } });
      if (!product) throw new Error(`No product found with SKU ${sku}`);

      const unitPrice = Number(product.unitPrice);
      const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
      const subtotal = lineTotal;
      const tax = Math.round(subtotal * taxRate * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;

      const saleNumber = await nextSaleNumber();

      const sale = await prisma.sale.create({
        data: {
          saleNumber,
          customerId: customer.id,
          warehouseId,
          status: 'DRAFT',
          subtotal,
          tax,
          total,
          items: {
            create: [{ productId: product.id, quantity, unitPrice, lineTotal }],
          },
        },
      });

      createdCount++;
      results.push({ row: rowNum, saleNumber: sale.saleNumber, status: 'created' });
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
