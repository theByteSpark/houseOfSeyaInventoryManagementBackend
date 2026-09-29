import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { toCsv } from '@/utils/csv';
import { buildExcelTemplate } from '@/utils/excel';

const TEMPLATE_HEADERS = [
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
  'quantityInStock',
  'reorderLevel',
];
const TEMPLATE_SAMPLE_ROWS: (string | number)[][] = [
  ['RNG-ENG-100', 'Solitaire Engagement Ring', 'Rings', 'Engagement', 'Gold 18kt', '4.2', '6200', 'Round', 'EF vvs', '1', '0.5', '45000', '450', '500', '68000', '6', '2'],
  ['NCK-CHN-200', 'Rope Chain — 18in', 'Necklaces', 'Chains', 'Gold 14kt', '12.5', '6200', 'Round', 'EF vvs/vs', '1', '0.05', '25000', '350', '300', '95000', '10', '3'],
];

export async function buildProductImportTemplate(format: 'csv' | 'xlsx'): Promise<string | Buffer> {
  if (format === 'xlsx') {
    return buildExcelTemplate(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
  }
  return toCsv(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
}

interface ImportRowResult {
  row: number;
  designNumber: string;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

export async function importProducts(
  rows: Record<string, string>[],
): Promise<{ results: ImportRowResult[]; createdCount: number; updatedCount: number; errorCount: number }> {
  if (rows.length === 0) {
    throw ApiError.badRequest('The uploaded file has no data rows.');
  }

  const results: ImportRowResult[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // account for header row, 1-indexed
    const raw = rows[i];
    const designNumber = raw.designNumber?.trim();

    try {
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

      const makingChargePerGram = Number(raw.makingChargePerGram);
      if (!Number.isFinite(makingChargePerGram) || makingChargePerGram < 0) {
        throw new Error('makingChargePerGram must be a non-negative number');
      }

      const sellingPrice = Number(raw.sellingPrice);
      if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) throw new Error('sellingPrice must be a positive number');

      const fixedExpense = raw.fixedExpense ? Number(raw.fixedExpense) : 0;
      if (!Number.isFinite(fixedExpense) || fixedExpense < 0) throw new Error('fixedExpense must be a non-negative number');

      const quantityInStock = raw.quantityInStock ? Number(raw.quantityInStock) : 0;
      if (!Number.isInteger(quantityInStock) || quantityInStock < 0) {
        throw new Error('quantityInStock must be a non-negative integer');
      }

      const reorderLevel = raw.reorderLevel ? Number(raw.reorderLevel) : 0;
      if (!Number.isInteger(reorderLevel) || reorderLevel < 0) throw new Error('reorderLevel must be a non-negative integer');

      // Every design has exactly one diamond block — there is no metal-only product, so
      // these are required on import the same way they are on the Add Product form.
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

      // Category/subcategory are upserted together, mirroring prisma/seed.ts's pattern —
      // a categoryName without a matching subcategoryName (or vice versa) is treated as
      // "no classification given" rather than an error.
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

      const existing = await prisma.product.findUnique({ where: { designNumber } });

      const sharedData = {
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
        reorderLevel,
        subcategoryId,
      };

      if (existing) {
        // Mirror updateProduct: quantityInStock is never touched here — it only
        // changes through a paired StockMovement write, not a plain field update.
        await prisma.product.update({ where: { designNumber }, data: sharedData });
        updatedCount++;
        results.push({ row: rowNum, designNumber, status: 'updated' });
      } else {
        const product = await prisma.product.create({
          data: { designNumber, ...sharedData, quantityInStock },
        });

        if (quantityInStock > 0) {
          await prisma.stockMovement.create({
            data: {
              productId: product.id,
              type: 'RESTOCK',
              quantity: quantityInStock,
              reason: 'Bulk import',
            },
          });
        }

        createdCount++;
        results.push({ row: rowNum, designNumber, status: 'created' });
      }
    } catch (err) {
      errorCount++;
      results.push({
        row: rowNum,
        designNumber: designNumber || '(missing)',
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { results, createdCount, updatedCount, errorCount };
}
