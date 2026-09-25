import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { toCsv } from '@/utils/csv';
import { buildExcelTemplate } from '@/utils/excel';

const TEMPLATE_HEADERS = ['companyName', 'contactPerson', 'email', 'phone', 'address'];
const TEMPLATE_SAMPLE_ROWS: (string | number)[][] = [
  ['Atelier Moreau', 'Jean Moreau', 'orders@ateliermoreau.fr', '+33 1 42 68 53 00', '12 Rue de la Paix, Paris, France'],
  ['Cascade Studio', '', 'hello@cascadestudio.com', '+1 415 555 0182', '480 Folsom St, San Francisco, CA'],
];

export async function buildVendorImportTemplate(format: 'csv' | 'xlsx'): Promise<string | Buffer> {
  if (format === 'xlsx') {
    return buildExcelTemplate(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
  }
  return toCsv(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS);
}

interface ImportRowResult {
  row: number;
  companyName: string;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

export async function importVendors(
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
    const companyName = raw.companyName?.trim();

    try {
      if (!companyName) throw new Error('companyName is required');

      const contactPerson = raw.contactPerson?.trim() || null;
      const email = raw.email?.trim() || null;
      const phone = raw.phone?.trim() || null;
      const address = raw.address?.trim() || null;

      const existing = await prisma.vendor.findFirst({
        where: { companyName: { equals: companyName, mode: 'insensitive' } },
      });

      if (existing) {
        await prisma.vendor.update({
          where: { id: existing.id },
          data: { companyName, contactPerson, email, phone, address },
        });
        updatedCount++;
        results.push({ row: rowNum, companyName, status: 'updated' });
      } else {
        await prisma.vendor.create({ data: { companyName, contactPerson, email, phone, address } });
        createdCount++;
        results.push({ row: rowNum, companyName, status: 'created' });
      }
    } catch (err) {
      errorCount++;
      results.push({
        row: rowNum,
        companyName: companyName || '(missing)',
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { results, createdCount, updatedCount, errorCount };
}
