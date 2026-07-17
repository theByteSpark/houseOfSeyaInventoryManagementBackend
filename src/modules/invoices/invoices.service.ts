import type { InvoiceStatus, Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import { deductStockInTransaction } from '@/modules/inventory/inventory.service';
import type { InvoiceInput } from './invoices.validation';

const INVOICE_INCLUDE = {
  customer: { select: { name: true } },
  items: { include: { product: { select: { name: true, sku: true } } } },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

function toDto(invoice: InvoiceWithRelations) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerName: invoice.customer.name,
    status: invoice.status,
    items: invoice.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    subtotal: Number(invoice.subtotal),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
    issuedAt: invoice.issuedAt,
    createdAt: invoice.createdAt,
  };
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count();
  return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function listInvoices() {
  const invoices = await prisma.invoice.findMany({
    include: INVOICE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return invoices.map(toDto);
}

export async function getInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  if (!invoice) throw ApiError.notFound('Invoice not found.');
  return toDto(invoice);
}

export async function createInvoice(input: InvoiceInput) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found.');

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const itemsData = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw ApiError.notFound(`Product ${line.productId} not found.`);

    const unitPrice = Number(product.unitPrice);
    const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
    subtotal += lineTotal;

    return {
      productId: product.id,
      quantity: line.quantity,
      unitPrice,
      lineTotal,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  const taxRate = input.taxRate ?? 0.1;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  const invoiceNumber = await nextInvoiceNumber();

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      customerId: customer.id,
      status: 'DRAFT',
      subtotal,
      tax,
      total,
      items: { create: itemsData },
    },
    include: INVOICE_INCLUDE,
  });

  return toDto(invoice);
}

async function transitionInvoice(id: string, status: InvoiceStatus) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  if (!invoice) throw ApiError.notFound('Invoice not found.');

  if (status === 'ISSUED') {
    if (invoice.status !== 'DRAFT') throw ApiError.badRequest('Only draft invoices can be issued.');

    const productIds = invoice.items.map((item) => item.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productById = new Map(products.map((p) => [p.id, p]));

    for (const item of invoice.items) {
      const product = productById.get(item.productId);
      if (!product || product.quantityInStock < item.quantity) {
        throw ApiError.badRequest(`Not enough stock for ${item.product.name}.`);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of invoice.items) {
        for (const op of deductStockInTransaction(tx, item.productId, item.quantity, `Invoice ${invoice.invoiceNumber}`)) {
          await op;
        }
      }
      return tx.invoice.update({
        where: { id },
        data: { status: 'ISSUED', issuedAt: new Date() },
        include: INVOICE_INCLUDE,
      });
    });

    return toDto(updated);
  }

  if (status === 'CANCELLED' && invoice.status === 'PAID') {
    throw ApiError.badRequest('A paid invoice cannot be cancelled.');
  }

  if (status === 'PAID' && invoice.status !== 'ISSUED') {
    throw ApiError.badRequest('Only issued invoices can be marked as paid.');
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data: { status },
    include: INVOICE_INCLUDE,
  });

  return toDto(updated);
}

export async function issueInvoice(id: string) {
  return transitionInvoice(id, 'ISSUED');
}

export async function markInvoicePaid(id: string) {
  return transitionInvoice(id, 'PAID');
}

export async function cancelInvoice(id: string) {
  return transitionInvoice(id, 'CANCELLED');
}
