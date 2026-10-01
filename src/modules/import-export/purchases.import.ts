import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { toCsv } from '@/utils/csv';
import { buildExcelTemplate } from '@/utils/excel';
import { nextPurchaseNumber } from '@/modules/purchases/purchases.service';

// A purchase always creates one brand-new, one-of-a-kind product — same as
// the "Add product" step inside the Purchase form, which never picks an
// existing product either. Since no two physical pieces of "the same
// design" weigh (and therefore cost) exactly the same, there's no quantity
// concept here: one row = one new product = one purchase with exactly one
// line item at quantity 1, costed at that product's own computed Total Cost.
const TEMPLATE_HEADERS = [
  'vendorName',
  'designNumber',
  'name',
  'categoryName',
  'subcategoryName',
  'metalType',
  'grossWeight',
  'metalRatePerGram',
  'diamondShape',
  'diamondQuality',
  'diamondPieces',
  'diamondCaratWeight',
  'diamondRate',
  'makingChargePerGram',
  'fixedExpense',
  'sellingPrice',
  'vendorInvoiceNumber',
  'vendorInvoiceDate',
];
const TEMPLATE_SAMPLE_ROWS: (string | number)[][] = [
  ['Atelier Moreau', 'RNG-ENG-100', 'Solitaire Engagement Ring', 'Rings', 'Engagement', 'Gold 18kt', '4.2', '6200', 'Round', 'EF vvs', '1', '0.5', '45000', '450', '500', '68000', 'INV-2044', '2026-09-01'],
  ['Cascade Studio', 'NCK-CHN-200', 'Rope Chain — 18in', 'Necklaces', 'Chains', 'Gold 14kt', '12.5', '6200', 'Round', 'EF vvs/vs', '1', '0.05', '25000', '350', '300', '95000', '', ''],
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
    const rowNum = i + 2; // account for header row, 1-indexed
    const raw = rows[i];

    try {
      const vendorName = raw.vendorName?.trim();
      if (!vendorName) throw new Error('vendorName is required');

      const designNumber = raw.designNumber?.trim();
      if (!designNumber) throw new Error('designNumber is required');

      const name = raw.name?.trim();
      if (!name) throw new Error('name is required');

      const metalType = raw.metalType?.trim();
      if (!metalType) throw new Error('metalType is required');

      const grossWeight = Number(raw.grossWeight);
      if (!Number.isFinite(grossWeight) || grossWeight <= 0) throw new Error('grossWeight must be a positive number');

      const metalRatePerGram = Number(raw.metalRatePerGram);
      if (!Number.isFinite(metalRatePerGram) || metalRatePerGram <= 0) {
        throw new Error('metalRatePerGram must be a positive number');
      }

      const diamondShape = raw.diamondShape?.trim();
      if (!diamondShape) throw new Error('diamondShape is required');

      const diamondQuality = raw.diamondQuality?.trim();
      if (!diamondQuality) throw new Error('diamondQuality is required');

      const diamondPieces = Number(raw.diamondPieces);
      if (!Number.isInteger(diamondPieces) || diamondPieces <= 0) {
        throw new Error('diamondPieces must be a positive integer');
      }

      const diamondCaratWeight = Number(raw.diamondCaratWeight);
      if (!Number.isFinite(diamondCaratWeight) || diamondCaratWeight <= 0) {
        throw new Error('diamondCaratWeight must be a positive number');
      }

      const diamondRate = Number(raw.diamondRate);
      if (!Number.isFinite(diamondRate) || diamondRate <= 0) throw new Error('diamondRate must be a positive number');

      const makingChargePerGram = Number(raw.makingChargePerGram);
      if (!Number.isFinite(makingChargePerGram) || makingChargePerGram < 0) {
        throw new Error('makingChargePerGram must be a non-negative number');
      }

      const fixedExpense = raw.fixedExpense ? Number(raw.fixedExpense) : 0;
      if (!Number.isFinite(fixedExpense) || fixedExpense < 0) throw new Error('fixedExpense must be a non-negative number');

      const sellingPrice = Number(raw.sellingPrice);
      if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) throw new Error('sellingPrice must be a positive number');

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

      // A purchase always defines a brand-new design — same rule the "Add
      // product" step inside the Purchase form follows, which never lets you
      // pick an existing product either.
      const existingProduct = await prisma.product.findUnique({ where: { designNumber } });
      if (existingProduct) throw new Error(`A product with design number "${designNumber}" already exists`);

      // Category/subcategory are upserted together, mirroring products.import.ts —
      // a categoryName without a matching subcategoryName (or vice versa) is
      // treated as "no classification given" rather than an error.
      let subcategoryId: string | null = null;
      const categoryName = raw.categoryName?.trim();
      const subcategoryName = raw.subcategoryName?.trim();
      if (categoryName && subcategoryName) {
        const category = await prisma.category.upsert({
          where: { name: categoryName },
          update: {},
          create: { name: categoryName },
        });
        const subcategory = await prisma.subcategory.upsert({
          where: { categoryId_name: { categoryId: category.id, name: subcategoryName } },
          update: {},
          create: { name: subcategoryName, categoryId: category.id },
        });
        subcategoryId = subcategory.id;
      }

      // Same cost formula as inventory.service.ts's toProductDto — the
      // purchase line's cost is this product's own Total Cost, not a
      // separately-entered figure.
      const metalCost = Math.round(grossWeight * metalRatePerGram * 100) / 100;
      const labourCost = Math.round(grossWeight * makingChargePerGram * 100) / 100;
      const diamondCost = Math.round(diamondCaratWeight * diamondRate * 100) / 100;
      const totalCost = Math.round((metalCost + diamondCost + labourCost + fixedExpense) * 100) / 100;

      const product = await prisma.product.create({
        data: {
          designNumber,
          name,
          metalType,
          grossWeight,
          metalRatePerGram,
          diamondShape,
          diamondQuality,
          diamondPieces,
          diamondCaratWeight,
          diamondRate,
          makingChargePerGram,
          fixedExpense,
          sellingPrice,
          quantityInStock: 0,
          reorderLevel: 0,
          subcategoryId,
        },
      });

      const purchaseNumber = await nextPurchaseNumber();

      const purchase = await prisma.purchase.create({
        data: {
          purchaseNumber,
          vendorId: vendor.id,
          status: 'ORDERED',
          orderedAt: new Date(),
          vendorInvoiceNumber,
          vendorInvoiceDate,
          items: {
            create: [{ productId: product.id, quantity: 1, receivedQuantity: 0, unitCost: totalCost, lineTotal: totalCost }],
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
