import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects, toCsv } from '@/utils/csv';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { requireWarehouseId } from '@/utils/warehouseScope';

// Headers are the exact labels shown on PurchaseFormPage.tsx ("Vendor",
// "Product", "Qty (kgs)", "Price (per kg)", "Completion date (YYYY-MM-DD)"), not
// camelCase field names, so a user filling the sheet can match each column
// to the field they already know from the form.
const TEMPLATE_HEADERS = ['Vendor', 'Product', 'Qty (kgs)', 'Price (per kg)', 'Completion date (YYYY-MM-DD)'];

export function buildPurchasesImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    ['Atelier Moreau', 'Cotton Poplin Fabric', '100', '6.50', '2026-12-31'],
    ['Cascade Studio', 'Merino Wool Yarn', '15', '22.00', '2026-12-15'],
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

// Matches the browser's native <input type="date"> value, so a date copied
// straight from the completion-date picker on the Purchase form pastes in as-is.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  let createdCount = 0;
  let errorCount = 0;

  // Every row is its own independent Purchase (one line item each) — no
  // grouping by vendor, unlike the earlier version of this importer.
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const raw = rows[i];

    try {
      const vendorName = raw['Vendor']?.trim();
      if (!vendorName) throw new Error('Vendor is required');

      const productName = raw['Product']?.trim();
      if (!productName) throw new Error('Product is required');

      const quantity = Number(raw['Qty (kgs)']);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Qty (kgs) must be a positive integer');

      const unitCost = Number(raw['Price (per kg)']);
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('Price (per kg) must be a non-negative number');

      const completionDateRaw = raw['Completion date (YYYY-MM-DD)']?.trim();
      if (!completionDateRaw) throw new Error('Completion date (YYYY-MM-DD) is required');
      if (!DATE_RE.test(completionDateRaw)) throw new Error('Completion date (YYYY-MM-DD) must be in YYYY-MM-DD format');
      const completionDate = new Date(completionDateRaw);
      if (Number.isNaN(completionDate.getTime())) throw new Error('Completion date (YYYY-MM-DD) is not a valid date');

      const vendor = await prisma.vendor.findFirst({
        where: { companyName: { equals: vendorName, mode: 'insensitive' } },
      });
      if (!vendor) throw new Error(`No vendor found with name "${vendorName}"`);

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

      const lineTotal = Math.round(unitCost * quantity * 100) / 100;
      const purchaseNumber = await nextPurchaseNumber();

      const purchase = await prisma.purchase.create({
        data: {
          purchaseNumber,
          vendorId: vendor.id,
          warehouseId,
          status: 'INWARD_TRANSIT',
          orderedAt: new Date(),
          completionDate,
          items: {
            create: [
              {
                productId: product.id,
                quantity,
                unitCost,
                lineTotal,
              },
            ],
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
