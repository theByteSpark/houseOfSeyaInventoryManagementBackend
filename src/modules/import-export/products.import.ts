import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects, toCsv } from '@/utils/csv';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { requireWarehouseId } from '@/utils/warehouseScope';
import { generateUniqueSku } from '@/modules/inventory/inventory.service';

const TEMPLATE_HEADERS = ['name', 'description', 'category', 'reorderLevel', 'quantityInStock'];

export function buildProductImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    ['Cotton Poplin — Ivory', 'Premium combed cotton poplin, 60" width', 'Fabrics', '50', '100'],
    ['Invisible Zippers — 22" Navy', 'Pack of 20', 'Trims & Accessories', '10', '20'],
  ]);
}

interface ImportRowResult {
  row: number;
  name: string;
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
    const name = raw.name?.trim();

    try {
      if (!name) throw new Error('name is required');

      const reorderLevel = Number(raw.reorderLevel || 0);
      if (!Number.isInteger(reorderLevel) || reorderLevel < 0) throw new Error('reorderLevel must be a non-negative integer');

      const quantityInStock = raw.quantityInStock ? Number(raw.quantityInStock) : 0;
      if (!Number.isInteger(quantityInStock) || quantityInStock < 0) {
        throw new Error('quantityInStock must be a non-negative integer');
      }

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

      const description = raw.description?.trim() || null;

      // Matched by name, not sku — ProductFormModal never collects a sku
      // (inventory.service.ts auto-generates one on create), so name is the
      // only identifier a CSV row and the form actually share. findMany, not
      // findFirst: name has no unique constraint, so a duplicate must fail
      // loudly instead of silently updating the wrong product.
      const matchingProducts = await prisma.product.findMany({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (matchingProducts.length > 1) {
        throw new Error(`Multiple products found named "${name}" — rename one or use a unique product name`);
      }
      const existing = matchingProducts[0] ?? null;

      const product = existing
        ? await prisma.product.update({
            where: { id: existing.id },
            data: { description, reorderLevel, categoryId },
          })
        : await prisma.product.create({
            data: { sku: await generateUniqueSku(name), name, description, reorderLevel, categoryId },
          });

      if (quantityInStock > 0) {
        await prisma.$transaction([
          prisma.productStock.upsert({
            where: { productId_warehouseId: { productId: product.id, warehouseId } },
            update: { quantity: { increment: quantityInStock } },
            create: { productId: product.id, warehouseId, quantity: quantityInStock },
          }),
          prisma.stockMovement.create({
            data: {
              productId: product.id,
              warehouseId,
              type: 'RESTOCK',
              quantity: quantityInStock,
              reason: 'CSV import',
            },
          }),
        ]);
      }

      if (existing) {
        updatedCount++;
        results.push({ row: rowNum, name, status: 'updated' });
      } else {
        createdCount++;
        results.push({ row: rowNum, name, status: 'created' });
      }
    } catch (err) {
      errorCount++;
      results.push({
        row: rowNum,
        name: name || '(missing)',
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { results, createdCount, updatedCount, errorCount };
}
