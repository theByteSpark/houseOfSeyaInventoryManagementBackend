import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { requireWarehouseId } from '@/utils/warehouseScope';
import { checkLowStock } from '@/modules/inventory/inventory.service';
import { createNotification } from '@/modules/notifications/notifications.service';
import type { CreateEnquiryInput, EditEnquiryInput, ConfirmEnquiryInput } from './enquiries.validation';

const ENQUIRY_INCLUDE = {
  product: { select: { name: true, sku: true } },
} satisfies Prisma.EnquiryInclude;

type EnquiryWithRelations = Prisma.EnquiryGetPayload<{ include: typeof ENQUIRY_INCLUDE }>;

const PURCHASE_INCLUDE = {
  vendor: { select: { companyName: true, contactPerson: true, email: true, phone: true, address: true } },
  warehouse: { select: { name: true } },
  items: { include: { product: { select: { name: true, sku: true } } } },
} satisfies Prisma.PurchaseInclude;

const SALE_INCLUDE = {
  customer: { select: { name: true, email: true, phone: true, address: true } },
  warehouse: { select: { name: true } },
  items: { include: { product: { select: { name: true, sku: true } } } },
} satisfies Prisma.SaleInclude;

type PurchaseWithRelations = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;
type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

function purchaseToDto(purchase: PurchaseWithRelations) {
  const items = purchase.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    sku: item.product.sku,
    quantity: item.quantity,
    unitCost: Number(item.unitCost),
    lineTotal: Number(item.lineTotal),
  }));
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return {
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    vendorId: purchase.vendorId,
    vendorName: purchase.vendor.companyName,
    warehouseId: purchase.warehouseId,
    warehouseName: purchase.warehouse.name,
    status: purchase.status,
    items,
    subtotal,
    total: subtotal,
    orderedAt: purchase.orderedAt,
    receivedAt: purchase.receivedAt,
    createdAt: purchase.createdAt,
  };
}

function saleToDto(sale: SaleWithRelations) {
  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    customerId: sale.customerId,
    customerName: sale.customer.name,
    warehouseId: sale.warehouseId,
    warehouseName: sale.warehouse.name,
    status: sale.status,
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    total: Number(sale.total),
    issuedAt: sale.issuedAt,
    createdAt: sale.createdAt,
  };
}

function toDto(enquiry: EnquiryWithRelations) {
  return {
    id: enquiry.id,
    productId: enquiry.productId,
    productName: enquiry.product.name,
    sku: enquiry.product.sku,
    quantity: enquiry.quantity,
    status: enquiry.status,
    createdAt: enquiry.createdAt,
  };
}

async function nextPurchaseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.purchase.count();
  return `PO-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function nextSaleNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.sale.count();
  return `SALE-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function listEnquiries(statusFilter?: 'OPEN' | 'FULFILLED' | 'ALL') {
  const where = !statusFilter || statusFilter === 'OPEN'
    ? { status: 'OPEN' as const }
    : statusFilter === 'ALL'
      ? {}
      : { status: 'FULFILLED' as const };

  const enquiries = await prisma.enquiry.findMany({
    where,
    include: ENQUIRY_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return enquiries.map(toDto);
}

export async function createEnquiry(input: CreateEnquiryInput) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw ApiError.notFound('Product not found.');

  const enquiry = await prisma.enquiry.create({
    data: { productId: input.productId, quantity: input.quantity },
    include: ENQUIRY_INCLUDE,
  });
  return toDto(enquiry);
}

export async function editEnquiry(id: string, input: EditEnquiryInput) {
  const existing = await prisma.enquiry.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Enquiry not found.');
  if (existing.status !== 'OPEN') throw ApiError.badRequest('Only an open enquiry can be edited.');

  const updated = await prisma.enquiry.update({
    where: { id },
    data: { quantity: { increment: input.additionalQuantity } },
    include: ENQUIRY_INCLUDE,
  });
  return toDto(updated);
}

export async function deleteEnquiry(id: string) {
  const existing = await prisma.enquiry.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Enquiry not found.');
  if (existing.status !== 'OPEN') throw ApiError.badRequest('Only an open enquiry can be deleted.');

  await prisma.enquiry.delete({ where: { id } });
}

// Confirming an enquiry means the vendor has already agreed to supply, so the
// Purchase it creates goes straight to IN_STOCK (adding stock immediately)
// rather than starting at ORDERED and waiting for a separate inward-transit /
// in-stock transition. The Sale then draws from that same freshly-added
// stock in the same transaction, so there is no artificial "not enough
// stock" failure — the two quantities can differ freely (e.g. buy 1000,
// sell 5) since the purchase always lands before the sale decrements.
// The enquiry's remaining quantity is reduced by the vendor-side (incoming)
// quantity only, and moves to FULFILLED (dropping out of listEnquiries)
// once it reaches zero. Over-fulfillment (vendor quantity > remaining) is
// rejected outright.
export async function confirmEnquiry(user: AuthenticatedUser, id: string, input: ConfirmEnquiryInput) {
  const enquiry = await prisma.enquiry.findUnique({ where: { id }, include: ENQUIRY_INCLUDE });
  if (!enquiry) throw ApiError.notFound('Enquiry not found.');
  if (enquiry.status !== 'OPEN') throw ApiError.badRequest('Enquiry is already fulfilled.');
  if (input.vendor.quantity > enquiry.quantity) {
    throw ApiError.badRequest(`Vendor quantity exceeds remaining enquiry quantity (${enquiry.quantity}).`);
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendor.vendorId } });
  if (!vendor) throw ApiError.notFound('Vendor not found.');
  const customer = await prisma.customer.findUnique({ where: { id: input.customer.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found.');

  const warehouseId = requireWarehouseId(user, input.warehouseId);

  const purchaseNumber = await nextPurchaseNumber();
  const saleNumber = await nextSaleNumber();

  const vendorLineTotal = Math.round(input.vendor.price * input.vendor.quantity * 100) / 100;
  const customerLineTotal = Math.round(input.customer.price * input.customer.quantity * 100) / 100;
  const tax = Math.round(customerLineTotal * 0.1 * 100) / 100;
  const saleTotal = Math.round((customerLineTotal + tax) * 100) / 100;

  const newQuantity = enquiry.quantity - input.vendor.quantity;
  const newStatus = newQuantity <= 0 ? 'FULFILLED' : 'OPEN';

  const { purchaseId, saleId } = await prisma.$transaction(
    async (tx) => {
      const createdPurchase = await tx.purchase.create({
        data: {
          purchaseNumber,
          vendorId: vendor.id,
          warehouseId,
          status: 'IN_STOCK',
          orderedAt: new Date(),
          receivedAt: new Date(),
          items: {
            create: [
              {
                productId: enquiry.productId,
                quantity: input.vendor.quantity,
                unitCost: input.vendor.price,
                lineTotal: vendorLineTotal,
              },
            ],
          },
        },
      });

      await tx.productStock.upsert({
        where: { productId_warehouseId: { productId: enquiry.productId, warehouseId } },
        update: { quantity: { increment: input.vendor.quantity } },
        create: { productId: enquiry.productId, warehouseId, quantity: input.vendor.quantity },
      });
      await tx.stockMovement.create({
        data: {
          productId: enquiry.productId,
          warehouseId,
          type: 'RESTOCK',
          quantity: input.vendor.quantity,
          reason: `PO ${purchaseNumber}`,
        },
      });

      const createdSale = await tx.sale.create({
        data: {
          saleNumber,
          customerId: customer.id,
          warehouseId,
          status: 'OUTWARD_TRANSIT',
          issuedAt: new Date(),
          subtotal: customerLineTotal,
          tax,
          total: saleTotal,
          items: {
            create: [
              {
                productId: enquiry.productId,
                quantity: input.customer.quantity,
                unitPrice: input.customer.price,
                lineTotal: customerLineTotal,
              },
            ],
          },
        },
      });

      const decremented = await tx.productStock.updateMany({
        where: { productId: enquiry.productId, warehouseId, quantity: { gte: input.customer.quantity } },
        data: { quantity: { decrement: input.customer.quantity } },
      });
      if (decremented.count === 0) {
        throw ApiError.badRequest(`Not enough stock for ${enquiry.product.name}.`);
      }

      await tx.stockMovement.create({
        data: {
          productId: enquiry.productId,
          warehouseId,
          type: 'SALE',
          quantity: -input.customer.quantity,
          reason: `Sale ${saleNumber}`,
        },
      });

      // Optimistic lock: only apply the decrement if the enquiry is still
      // OPEN with the exact quantity we read at the top of this function.
      // Guards against two concurrent confirms (e.g. a double-click) both
      // reading the same starting quantity and each independently
      // decrementing from it, which would double-count the reduction.
      const enquiryUpdate = await tx.enquiry.updateMany({
        where: { id, status: 'OPEN', quantity: enquiry.quantity },
        data: { quantity: newQuantity, status: newStatus },
      });
      if (enquiryUpdate.count === 0) {
        throw ApiError.badRequest('Enquiry was already confirmed by another request.');
      }

      return { purchaseId: createdPurchase.id, saleId: createdSale.id };
    },
    { timeout: 30000, maxWait: 30000 },
  );

  const [purchase, sale] = await Promise.all([
    prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId }, include: PURCHASE_INCLUDE }),
    prisma.sale.findUniqueOrThrow({ where: { id: saleId }, include: SALE_INCLUDE }),
  ]);

  await checkLowStock(enquiry.productId, warehouseId);
  await createNotification({
    warehouseId,
    type: 'SALE_ISSUED',
    title: 'Sale confirmed',
    message: `Sale ${sale.saleNumber} for ${customer.name} was confirmed.`,
    metadata: { saleId: sale.id, saleNumber: sale.saleNumber },
  });

  return {
    purchase: purchaseToDto(purchase),
    sale: saleToDto(sale),
    enquiry: { id, quantity: newQuantity, status: newStatus },
  };
}
