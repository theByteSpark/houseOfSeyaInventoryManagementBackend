import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { toCsv } from '@/utils/csv';
import { buildExcelTemplate } from '@/utils/excel';

const TEMPLATE_HEADERS = ['name', 'email', 'phone', 'address'];
const TEMPLATE_SAMPLE_ROWS: (string | number)[][] = [
  ['Atelier Moreau', 'orders@ateliermoreau.fr', '+33 1 42 68 53 00', '12 Rue de la Paix, Paris, France'],
  ['Cascade Studio', '', '+1 415 555 0182', '480 Folsom St, San Francisco, CA'],
];

export async function buildCustomerImportTemplate(format: 'csv' | 'xlsx'): Promise<string | Buffer> {
  if (format === 'xlsx') {
    return buildExcelTemplate(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
  }
  return toCsv(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
}

interface ImportRowResult {
  row: number;
  name: string;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

export async function importCustomers(
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
    const rowNum = i + 2;
    const raw = rows[i];
    const name = raw.name?.trim();

    try {
      if (!name) throw new Error('name is required');

      const email = raw.email?.trim() || null;
      const phone = raw.phone?.trim() || null;
      const address = raw.address?.trim() || null;

      // Customer.email is nullable and NOT unique — a row is only matched
      // against an existing customer when an email is given.
      const existing = email ? await prisma.customer.findFirst({ where: { email } }) : null;

      if (existing) {
        await prisma.customer.update({ where: { id: existing.id }, data: { name, email, phone, address } });
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
