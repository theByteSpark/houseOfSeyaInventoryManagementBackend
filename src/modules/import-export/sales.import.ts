import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects, toCsv } from '@/utils/csv';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { requireWarehouseId } from '@/utils/warehouseScope';
import { SALES_TAX_RATE } from '@/modules/sales/sales.service';

const TEMPLATE_HEADERS = ['customerName', 'inventoryName', 'quantity', 'unitPrice'];

export function buildSalesImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    ['Atelier Moreau', 'Cotton Poplin Fabric', '10', '8.50'],
    ['Atelier Moreau', 'Invisible Zipper', '2', '15.40'],
    ['Cascade Studio', 'Merino Wool Yarn', '3', '22.00'],
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

interface ParsedLine {
  row: number;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

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
  let errorCount = 0;

  // Group valid rows by customer (case-insensitive name) so every customer
  // with multiple rows in the sheet becomes a single sale with one line item
  // per row, instead of one sale per row.
  const groups = new Map<string, { customerId: string; lines: ParsedLine[] }>();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const raw = rows[i];

    try {
      const customerName = raw.customerName?.trim();
      if (!customerName) throw new Error('customerName is required');

      const inventoryName = raw.inventoryName?.trim();
      if (!inventoryName) throw new Error('inventoryName is required');

      const quantity = Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');

      const unitPrice = Number(raw.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('unitPrice must be a non-negative number');

      const customer = await prisma.customer.findFirst({
        where: { name: { equals: customerName, mode: 'insensitive' } },
      });
      if (!customer) throw new Error(`No customer found with name "${customerName}"`);

      const product = await prisma.product.findFirst({
        where: { name: { equals: inventoryName, mode: 'insensitive' } },
      });
      if (!product) throw new Error(`No product found with inventory name "${inventoryName}"`);

      const groupKey = customerName.toLowerCase();
      const group = groups.get(groupKey) ?? { customerId: customer.id, lines: [] };
      group.lines.push({ row: rowNum, productId: product.id, productName: product.name, quantity, unitPrice });
      groups.set(groupKey, group);
    } catch (err) {
      errorCount++;
      results.push({
        row: rowNum,
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  let createdCount = 0;

  for (const { customerId, lines } of groups.values()) {
    if (lines.length === 0) continue;

    try {
      // Check combined stock per product across all of this customer's rows
      // before creating anything — two rows for the same product must not
      // silently oversell the warehouse's stock.
      const neededByProduct = new Map<string, number>();
      for (const line of lines) {
        neededByProduct.set(line.productId, (neededByProduct.get(line.productId) ?? 0) + line.quantity);
      }

      for (const [productId, needed] of neededByProduct) {
        const stock = await prisma.productStock.findUnique({
          where: { productId_warehouseId: { productId, warehouseId } },
        });
        if (!stock || stock.quantity < needed) {
          const productName = lines.find((l) => l.productId === productId)?.productName ?? productId;
          throw new Error(`Not enough stock for ${productName} at this warehouse`);
        }
      }

      const subtotal = Math.round(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100) / 100;
      const tax = Math.round(subtotal * SALES_TAX_RATE * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;
      const saleNumber = await nextSaleNumber();

      await prisma.$transaction(
        async (tx) => {
          await tx.sale.create({
            data: {
              saleNumber,
              customerId,
              warehouseId,
              status: 'OUTWARD_TRANSIT',
              issuedAt: new Date(),
              subtotal,
              tax,
              total,
              items: {
                create: lines.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  lineTotal: Math.round(line.unitPrice * line.quantity * 100) / 100,
                })),
              },
            },
          });

          // One update per product (decrement amounts differ, can't batch),
          // but the accompanying movement rows are collapsed into a single
          // createMany — halves the round-trips inside the held-open
          // transaction for customers with several distinct products.
          for (const [productId, needed] of neededByProduct) {
            await tx.productStock.update({
              where: { productId_warehouseId: { productId, warehouseId } },
              data: { quantity: { decrement: needed } },
            });
          }

          await tx.stockMovement.createMany({
            data: Array.from(neededByProduct.entries()).map(([productId, needed]) => ({
              productId,
              warehouseId,
              type: 'SALE' as const,
              quantity: -needed,
              reason: `Sale ${saleNumber}`,
            })),
          });
        },
        { timeout: 30000, maxWait: 30000 },
      );

      createdCount++;
      for (const line of lines) {
        results.push({ row: line.row, saleNumber, status: 'created' });
      }
    } catch (err) {
      errorCount += lines.length;
      const message = err instanceof Error ? err.message : 'Unknown error';
      for (const line of lines) {
        results.push({ row: line.row, status: 'error', message });
      }
    }
  }

  results.sort((a, b) => a.row - b.row);

  return { results, createdCount, errorCount };
}
