import ExcelJS from 'exceljs';

function cellToString(value: ExcelJS.CellValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((rt: { text: string }) => rt.text).join('').trim();
    }
    if ('result' in value && value.result !== null && value.result !== undefined) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text.trim();
    }
    if ('error' in value && typeof value.error === 'string') {
      return value.error.trim();
    }
  }
  return String(value).trim();
}

export async function parseExcel(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = cellToString(cell.value);
  });

  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const obj: Record<string, string> = {};
    let hasData = false;
    headers.forEach((header, i) => {
      if (!header) return;
      const cell = row.getCell(i + 1);
      const strValue = cellToString(cell.value);
      obj[header] = strValue;
      if (strValue) hasData = true;
    });
    if (hasData) rows.push(obj);
  }

  return rows;
}

export async function buildExcelTemplate(
  headers: string[],
  sampleRows: (string | number)[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Import Template');

  worksheet.addRow(headers);
  for (const row of sampleRows) {
    worksheet.addRow(row);
  }

  worksheet.columns.forEach((column) => {
    column.width = Math.max(...[column.header?.toString().length ?? 0, ...sampleRows.map((row) => String(row[worksheet.columns.indexOf(column)] ?? '').length)]) + 4;
  });

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
