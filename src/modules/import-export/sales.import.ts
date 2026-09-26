import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { toCsv } from '@/utils/csv';
import { buildExcelTemplate } from '@/utils/excel';
import { nextSaleNumber, TAX_RATE } from '@/modules/sales/sales.service';

// One row = one sale with exactly one line item. Grouping several rows into a
// single multi-line sale is out of scope for this import.
const TEMPLATE_HEADERS = ['customerEmail', 'designNumber', 'quantity'];
const TEMPLATE_SAMPLE_ROWS: (string | number)[][] = [
  ['orders@ateliermoreau.fr', 'RNG-ENG-001', '1'],
  ['hello@cascadestudio.com', 'NCK-CHN-010', '2'],
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

export async function importSales(
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
      const customerEmail = raw.customerEmail?.trim();
      if (!customerEmail) throw new Error('customerEmail is required');

      const designNumber = raw.designNumber?.trim();
      if (!designNumber) throw new Error('designNumber is required');

      const quantity = Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');

      const customer = await prisma.customer.findFirst({ where: { email: customerEmail } });
      if (!customer) throw new Error(`No customer found with email ${customerEmail}`);

      const product = await prisma.product.findUnique({ where: { designNumber } });
      if (!product) throw new Error(`No product found with design number ${designNumber}`);

      const unitPrice = Number(product.sellingPrice);
      const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
      const subtotal = lineTotal;
      const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;

      const saleNumber = await nextSaleNumber();

      const sale = await prisma.sale.create({
        data: {
          saleNumber,
          customerId: customer.id,
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
