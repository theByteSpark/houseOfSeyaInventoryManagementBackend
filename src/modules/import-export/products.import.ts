import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects, toCsv } from '@/utils/csv';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { requireWarehouseId } from '@/utils/warehouseScope';

const TEMPLATE_HEADERS = ['sku', 'name', 'description', 'category', 'unitPrice', 'reorderLevel', 'quantity'];

export function buildProductImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    ['FAB-COT-001', 'Cotton Poplin — Ivory', 'Premium combed cotton poplin, 60" width', 'Fabrics', '8.50', '50', '100'],
    ['TRM-ZIP-021', 'Invisible Zippers — 22" Navy', 'Pack of 20', 'Trims & Accessories', '15.40', '10', '20'],
  ]);
}

interface ImportRowResult {
  row: number;
  sku: string;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

export async function importProductsCsv(
  user: AuthenticatedUser,
  csvContent: string,
  warehouseIdInput?: string,
): Promise<{ results: ImportRowResult[]; createdCount: number; updatedCount: number; errorCount: number }> {
  const rows = parseCsvObjects(csvContent);
  if (rows.length === 0) {
    throw ApiError.badRequest('The uploaded file has no data rows.');
  }

  const warehouseId = requireWarehouseId(user, warehouseIdInput);

  const results: ImportRowResult[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // account for header row, 1-indexed
    const raw = rows[i];
    const sku = raw.sku?.trim();

    try {
      if (!sku) throw new Error('sku is required');
      const name = raw.name?.trim();
      if (!name) throw new Error('name is required');

      const unitPrice = Number(raw.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error('unitPrice must be a positive number');

      const reorderLevel = Number(raw.reorderLevel || 0);
      if (!Number.isInteger(reorderLevel) || reorderLevel < 0) throw new Error('reorderLevel must be a non-negative integer');

      const quantity = raw.quantity ? Number(raw.quantity) : 0;
      if (!Number.isInteger(quantity) || quantity < 0) throw new Error('quantity must be a non-negative integer');

      let categoryId: string | null = null;
      const categoryName = raw.category?.trim();
      if (categoryName) {
        const category = await prisma.category.upsert({
          where: { name: categoryName },
          update: {},
          create: { name: categoryName },
        });
        categoryId = category.id;
      }

      const existing = await prisma.product.findUnique({ where: { sku } });

      const product = await prisma.product.upsert({
        where: { sku },
        update: {
          name,
          description: raw.description?.trim() || null,
          unitPrice,
          reorderLevel,
          categoryId,
        },
        create: {
          sku,
          name,
          description: raw.description?.trim() || null,
          unitPrice,
          reorderLevel,
          categoryId,
        },
      });

      if (quantity > 0) {
        await prisma.$transaction([
          prisma.productStock.upsert({
            where: { productId_warehouseId: { productId: product.id, warehouseId } },
            update: { quantity: { increment: quantity } },
            create: { productId: product.id, warehouseId, quantity },
          }),
          prisma.stockMovement.create({
            data: {
              productId: product.id,
              warehouseId,
              type: 'RESTOCK',
              quantity,
              reason: 'CSV import',
            },
          }),
        ]);
      }

      if (existing) {
        updatedCount++;
        results.push({ row: rowNum, sku, status: 'updated' });
      } else {
        createdCount++;
        results.push({ row: rowNum, sku, status: 'created' });
      }
    } catch (err) {
      errorCount++;
      results.push({
        row: rowNum,
        sku: sku || '(missing)',
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { results, createdCount, updatedCount, errorCount };
}
