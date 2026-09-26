import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { parseCsvObjects, toCsv } from '@/utils/csv';

const TEMPLATE_HEADERS = ['companyName', 'contactPerson', 'email', 'phone', 'address'];

export function buildVendorsImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    ['Everest Fabrics Pvt Ltd', 'Rakesh Sharma', 'sales@everestfabrics.com', '9988776655', '221 Industrial Area, Ludhiana'],
    ['Zenith Trims Co.', 'Meera Nair', 'orders@zenithtrims.com', '9871234560', '18 Peenya Estate, Bengaluru'],
  ]);
}

interface ImportRowResult {
  row: number;
  companyName: string;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function importVendorsCsv(
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
    const companyName = raw.companyName?.trim();

    try {
      if (!companyName) throw new Error('companyName is required');

      const email = raw.email?.trim() || null;
      if (email && !EMAIL_RE.test(email)) throw new Error('email is not a valid email address');

      const contactPerson = raw.contactPerson?.trim() || null;
      const phone = raw.phone?.trim() || null;
      const address = raw.address?.trim() || null;

      const existing = await prisma.vendor.findFirst({
        where: { companyName: { equals: companyName, mode: 'insensitive' } },
      });

      if (existing) {
        await prisma.vendor.update({ where: { id: existing.id }, data: { contactPerson, email, phone, address } });
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
