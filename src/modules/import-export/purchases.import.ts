import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects, toCsv } from '@/utils/csv';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { requireWarehouseId } from '@/utils/warehouseScope';

const TEMPLATE_HEADERS = ['vendorName', 'inventoryName', 'quantity', 'unitCost'];

export function buildPurchasesImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    ['Atelier Moreau', 'Cotton Poplin Fabric', '100', '6.50'],
    ['Atelier Moreau', 'Invisible Zipper', '20', '11.00'],
    ['Cascade Studio', 'Merino Wool Yarn', '15', '22.00'],
  ]);
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

interface ParsedLine {
  row: number;
  productId: string;
  quantity: number;
  unitCost: number;
}

export async function importPurchasesCsv(
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

  // Group valid rows by vendor (case-insensitive) so every vendor with
  // multiple rows in the sheet becomes a single purchase with one line item
  // per row, instead of one purchase per row.
  const groups = new Map<string, { vendorId: string; lines: ParsedLine[] }>();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const raw = rows[i];

    try {
      const vendorName = raw.vendorName?.trim();
      if (!vendorName) throw new Error('vendorName is required');

      const inventoryName = raw.inventoryName?.trim();
      if (!inventoryName) throw new Error('inventoryName is required');

      const quantity = Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');

      const unitCost = Number(raw.unitCost);
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('unitCost must be a non-negative number');

      const vendor = await prisma.vendor.findFirst({
        where: { companyName: { equals: vendorName, mode: 'insensitive' } },
      });
      if (!vendor) throw new Error(`No vendor found with name "${vendorName}"`);

      const product = await prisma.product.findFirst({
        where: { name: { equals: inventoryName, mode: 'insensitive' } },
      });
      if (!product) throw new Error(`No product found with inventory name "${inventoryName}"`);

      const groupKey = vendorName.toLowerCase();
      const group = groups.get(groupKey) ?? { vendorId: vendor.id, lines: [] };
      group.lines.push({ row: rowNum, productId: product.id, quantity, unitCost });
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

  for (const { vendorId, lines } of groups.values()) {
    if (lines.length === 0) continue;

    const purchaseNumber = await nextPurchaseNumber();

    const purchase = await prisma.purchase.create({
      data: {
        purchaseNumber,
        vendorId,
        warehouseId,
        status: 'ORDERED',
        orderedAt: new Date(),
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            lineTotal: Math.round(line.unitCost * line.quantity * 100) / 100,
          })),
        },
      },
    });

    createdCount++;
    for (const line of lines) {
      results.push({ row: line.row, purchaseNumber: purchase.purchaseNumber, status: 'created' });
    }
  }

  results.sort((a, b) => a.row - b.row);

  return { results, createdCount, errorCount };
}
