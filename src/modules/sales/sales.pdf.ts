import PDFDocument from 'pdfkit';
import * as salesService from './sales.service';

const numberFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// pdfkit's built-in Helvetica font (WinAnsi encoding) can't render the ₹
// glyph, so use a plain-text prefix instead of Intl's currency formatting.
function formatCurrency(value: number): string {
  return `Rs. ${numberFormatter.format(value)}`;
}

export async function generateInvoicePdf(
  saleId: string,
): Promise<{ doc: PDFKit.PDFDocument; saleNumber: string }> {
  const sale = await salesService.getSaleForInvoice(saleId);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  doc.fontSize(20).font('Helvetica-Bold').text('House of Seya', { continued: false });
  doc.fontSize(10).font('Helvetica').fillColor('#555').text('Invoice');
  doc.moveDown(1.5);

  doc.fillColor('#000').fontSize(14).font('Helvetica-Bold').text(`Invoice ${sale.saleNumber}`);
  doc.fontSize(10).font('Helvetica').fillColor('#555');
  doc.text(`Status: ${sale.status}`);
  doc.text(`Created: ${sale.createdAt.toLocaleDateString('en-IN')}`);
  if (sale.issuedAt) doc.text(`Issued: ${sale.issuedAt.toLocaleDateString('en-IN')}`);
  doc.moveDown(1);

  doc.fillColor('#000').fontSize(11).font('Helvetica-Bold').text('Billed to');
  doc.fontSize(10).font('Helvetica').fillColor('#333');
  doc.text(sale.customer.name);
  if (sale.customer.email) doc.text(sale.customer.email);
  if (sale.customer.phone) doc.text(sale.customer.phone);
  if (sale.customer.address) doc.text(sale.customer.address);
  doc.moveDown(1.5);

  const tableTop = doc.y;
  const columns = {
    product: 50,
    qty: 300,
    unitPrice: 360,
    lineTotal: 460,
  };

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');
  doc.text('Product', columns.product, tableTop);
  doc.text('Qty', columns.qty, tableTop, { width: 50, align: 'right' });
  doc.text('Unit price', columns.unitPrice, tableTop, { width: 90, align: 'right' });
  doc.text('Line total', columns.lineTotal, tableTop, { width: 90, align: 'right' });
  doc.moveTo(50, tableTop + 16).lineTo(550, tableTop + 16).strokeColor('#ccc').stroke();

  let y = tableTop + 24;
  doc.font('Helvetica').fillColor('#333');
  for (const item of sale.items) {
    doc.text(`${item.product.name} (${item.product.sku})`, columns.product, y, { width: 240 });
    doc.text(String(item.quantity), columns.qty, y, { width: 50, align: 'right' });
    doc.text(formatCurrency(Number(item.unitPrice)), columns.unitPrice, y, { width: 90, align: 'right' });
    doc.text(formatCurrency(Number(item.lineTotal)), columns.lineTotal, y, { width: 90, align: 'right' });
    y += 20;
  }

  doc.moveTo(50, y + 4).lineTo(550, y + 4).strokeColor('#ccc').stroke();
  y += 16;

  doc.font('Helvetica').fillColor('#333');
  doc.text('Subtotal', columns.unitPrice, y, { width: 90, align: 'right' });
  doc.text(formatCurrency(Number(sale.subtotal)), columns.lineTotal, y, { width: 90, align: 'right' });
  y += 18;
  doc.text('Tax', columns.unitPrice, y, { width: 90, align: 'right' });
  doc.text(formatCurrency(Number(sale.tax)), columns.lineTotal, y, { width: 90, align: 'right' });
  y += 18;
  doc.font('Helvetica-Bold').fillColor('#000');
  doc.text('Total', columns.unitPrice, y, { width: 90, align: 'right' });
  doc.text(formatCurrency(Number(sale.total)), columns.lineTotal, y, { width: 90, align: 'right' });

  doc.end();

  return { doc, saleNumber: sale.saleNumber };
}
