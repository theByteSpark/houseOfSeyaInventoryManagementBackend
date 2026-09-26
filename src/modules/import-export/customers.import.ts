import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects, toCsv } from '@/utils/csv';

const TEMPLATE_HEADERS = ['name', 'email', 'phone', 'address'];

export function buildCustomersImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    ['Sunrise Textiles', 'orders@sunrisetextiles.com', '9876543210', '12 MG Road, Bengaluru'],
    ['Coral Fashion House', 'contact@coralfashion.com', '9123456780', '45 Anna Salai, Chennai'],
  ]);
}

interface ImportRowResult {
  row: number;
  name: string;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function importCustomersCsv(
  csvContent: string,
): Promise<{ results: ImportRowResult[]; createdCount: number; updatedCount: number; errorCount: number }> {
  const rows = parseCsvObjects(csvContent);
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
    const name = raw.name?.trim();

    try {
      if (!name) throw new Error('name is required');

      const email = raw.email?.trim() || null;
      if (email && !EMAIL_RE.test(email)) throw new Error('email is not a valid email address');

      const phone = raw.phone?.trim() || null;
      const address = raw.address?.trim() || null;

      const existing = await prisma.customer.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });

      if (existing) {
        await prisma.customer.update({ where: { id: existing.id }, data: { email, phone, address } });
        updatedCount++;
        results.push({ row: rowNum, name, status: 'updated' });
      } else {
        await prisma.customer.create({ data: { name, email, phone, address } });
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
