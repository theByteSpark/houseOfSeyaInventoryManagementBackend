import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects, toCsv } from '@/utils/csv';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { requireWarehouseId } from '@/utils/warehouseScope';
import { SALES_TAX_RATE } from '@/modules/sales/sales.service';

const TEMPLATE_HEADERS = ['customerName', 'productName', 'quantity', 'unitPrice', 'completionDate'];

export function buildSalesImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    ['Atelier Moreau', 'Cotton Poplin Fabric', '10', '8.50', '2026-12-31'],
    ['Cascade Studio', 'Merino Wool Yarn', '3', '22.00', '2026-12-15'],
  ]);
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

// Matches the browser's native <input type="date"> value, so a date copied
// straight from the completion-date picker on the Sale form pastes in as-is.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function importSalesCsv(
  user: AuthenticatedUser,
  csvContent: string,
  warehouseIdInput?: string,
): Promise<{ results: ImportRowResult[]; createdCount: number; errorCount: number }> {
  const rows = parseCsvObjects(csvContent);
  if (rows.length === 0) {
    throw ApiError.badRequest('The uploaded file has no data rows.');
  }

  const warehouseId = requireWarehouseId(user, warehouseIdInput);

  const results: ImportRowResult[] = [];
  let createdCount = 0;
  let errorCount = 0;

  // Every row is its own independent Sale (one line item each) — no grouping
  // by customer, unlike the earlier version of this importer.
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // account for header row, 1-indexed
    const raw = rows[i];

    try {
      const customerName = raw.customerName?.trim();
      if (!customerName) throw new Error('customerName is required');

      const productName = raw.productName?.trim();
      if (!productName) throw new Error('productName is required');

      const quantity = Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');

      const unitPrice = Number(raw.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('unitPrice must be a non-negative number');

      const completionDateRaw = raw.completionDate?.trim();
      if (!completionDateRaw) throw new Error('completionDate is required (format: YYYY-MM-DD)');
      if (!DATE_RE.test(completionDateRaw)) throw new Error('completionDate must be in YYYY-MM-DD format');
      const completionDate = new Date(completionDateRaw);
      if (Number.isNaN(completionDate.getTime())) throw new Error('completionDate is not a valid date');

      const customer = await prisma.customer.findFirst({
        where: { name: { equals: customerName, mode: 'insensitive' } },
      });
      if (!customer) throw new Error(`No customer found with name "${customerName}"`);

      // findMany, not findFirst: Product.name has no unique constraint (sku
      // does), so a silent findFirst could match the wrong product if two
      // products ever share a name. Fail loudly instead.
      const matchingProducts = await prisma.product.findMany({
        where: { name: { equals: productName, mode: 'insensitive' } },
      });
      if (matchingProducts.length === 0) throw new Error(`No product found with name "${productName}"`);
      if (matchingProducts.length > 1) {
        throw new Error(`Multiple products found named "${productName}" — rename one or use a unique product name`);
      }
      const product = matchingProducts[0];

      const stock = await prisma.productStock.findUnique({
        where: { productId_warehouseId: { productId: product.id, warehouseId } },
      });
      if (!stock || stock.quantity < quantity) {
        throw new Error(`Not enough stock for ${product.name} at this warehouse`);
      }

      const subtotal = Math.round(unitPrice * quantity * 100) / 100;
      const tax = Math.round(subtotal * SALES_TAX_RATE * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;
      const saleNumber = await nextSaleNumber();

      await prisma.$transaction(async (tx) => {
        await tx.sale.create({
          data: {
            saleNumber,
            customerId: customer.id,
            warehouseId,
            status: 'OUTWARD_TRANSIT',
            issuedAt: new Date(),
            completionDate,
            subtotal,
            tax,
            total,
            items: {
              create: [
                {
                  productId: product.id,
                  quantity,
                  unitPrice,
                  lineTotal: subtotal,
                },
              ],
            },
          },
        });

        await tx.productStock.update({
          where: { productId_warehouseId: { productId: product.id, warehouseId } },
          data: { quantity: { decrement: quantity } },
        });

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            warehouseId,
            type: 'SALE',
            quantity: -quantity,
            reason: `Sale ${saleNumber}`,
          },
        });
      });

      createdCount++;
      results.push({ row: rowNum, saleNumber, status: 'created' });
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
