import type { Prisma } from '@prisma/client';
import { SaleStatus, PurchaseStatus } from '@prisma/client';
import { prisma } from '@/config/db';

function parseDateRange(from?: string, to?: string) {
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  if (toDate) toDate.setHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

function buildSaleDateFilter(fromDate?: Date, toDate?: Date): Prisma.SaleWhereInput {
  const filter: Prisma.SaleWhereInput = {};
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.gte = fromDate;
    if (toDate) filter.createdAt.lte = toDate;
  }
  return filter;
}

function buildPurchaseDateFilter(fromDate?: Date, toDate?: Date): Prisma.PurchaseWhereInput {
  const filter: Prisma.PurchaseWhereInput = {};
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.gte = fromDate;
    if (toDate) filter.createdAt.lte = toDate;
  }
  return filter;
}

export async function getSalesReport(from?: string, to?: string, status?: string) {
  const { fromDate, toDate } = parseDateRange(from, to);
  const dateFilter = buildSaleDateFilter(fromDate, toDate);

  const statusFilter: Prisma.SaleWhereInput =
    status && status !== 'ALL' ? { status: status as SaleStatus } : {};

  const where: Prisma.SaleWhereInput = { AND: [dateFilter, statusFilter] };

  const [sales, totalCount, statusBreakdown, topProducts] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.sale.count({ where }),
    prisma.sale.groupBy({ by: ['status'], where, _count: true }),
    prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: where },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    }),
  ]);

  const topProductIds = topProducts.map((p) => p.productId);
  const products = await prisma.product.findMany({ where: { id: { in: topProductIds } }, select: { id: true, name: true, sku: true } });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);
  const totalTax = sales.reduce((sum, s) => sum + Number(s.tax), 0);

  return {
    totalCount,
    totalRevenue,
    totalTax,
    statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: s._count })),
    topProducts: topProducts.map((p) => ({
      product: productMap.get(p.productId)?.name ?? 'Unknown',
      sku: productMap.get(p.productId)?.sku ?? '',
      quantity: p._sum.quantity ?? 0,
      revenue: Number(p._sum.lineTotal ?? 0),
    })),
    sales: sales.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      customerName: s.customer.name,
      status: s.status,
      total: Number(s.total),
      createdAt: s.createdAt,
    })),
  };
}

export async function getPurchasesReport(from?: string, to?: string, status?: string) {
  const { fromDate, toDate } = parseDateRange(from, to);
  const dateFilter = buildPurchaseDateFilter(fromDate, toDate);

  const statusFilter: Prisma.PurchaseWhereInput =
    status && status !== 'ALL' ? { status: status as PurchaseStatus } : {};

  const where: Prisma.PurchaseWhereInput = { AND: [dateFilter, statusFilter] };

  const [purchases, totalCount, statusBreakdown, topProducts] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: {
        vendor: { select: { companyName: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.purchase.count({ where }),
    prisma.purchase.groupBy({ by: ['status'], where, _count: true }),
    prisma.purchaseItem.groupBy({
      by: ['productId'],
      where: { purchase: where },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    }),
  ]);

  const topProductIds = topProducts.map((p) => p.productId);
  const products = await prisma.product.findMany({ where: { id: { in: topProductIds } }, select: { id: true, name: true, sku: true } });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const totalCost = purchases.reduce((sum, p) => {
    return sum + p.items.reduce((itemSum, item) => itemSum + Number(item.lineTotal), 0);
  }, 0);

  return {
    totalCount,
    totalCost,
    statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: s._count })),
    topProducts: topProducts.map((p) => ({
      product: productMap.get(p.productId)?.name ?? 'Unknown',
      sku: productMap.get(p.productId)?.sku ?? '',
      quantity: p._sum.quantity ?? 0,
      cost: Number(p._sum.lineTotal ?? 0),
    })),
    purchases: purchases.map((p) => ({
      id: p.id,
      purchaseNumber: p.purchaseNumber,
      vendorName: p.vendor.companyName,
      status: p.status,
      total: p.items.reduce((sum, item) => sum + Number(item.lineTotal), 0),
      createdAt: p.createdAt,
    })),
  };
}

export async function getInventoryReport() {
  const [products, lowStockProducts, categories, recentMovements] = await Promise.all([
    prisma.product.findMany({
      include: { subcategory: { include: { category: { select: { name: true } } } } },
    }),
    prisma.product.findMany({
      where: { quantityInStock: { lte: prisma.product.fields.reorderLevel } },
      orderBy: { quantityInStock: 'asc' },
      take: 20,
    }),
    prisma.category.findMany({
      include: {
        subcategories: {
          include: { _count: { select: { products: true } } },
        },
      },
    }),
    prisma.stockMovement.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, sku: true } } },
    }),
  ]);

  const totalStockValue = products.reduce((sum, p) => sum + Number(p.unitPrice) * p.quantityInStock, 0);
  const lowStockCount = products.filter((p) => p.quantityInStock <= p.reorderLevel).length;

  const categoryBreakdown = categories.map((cat) => {
    const productCount = cat.subcategories.reduce((sum, sub) => sum + sub._count.products, 0);
    const categoryProducts = products.filter((p) => p.subcategory?.category?.name === cat.name);
    const stockValue = categoryProducts.reduce((sum, p) => sum + Number(p.unitPrice) * p.quantityInStock, 0);
    return {
      category: cat.name,
      productCount,
      stockValue,
    };
  });

  return {
    totalProducts: products.length,
    totalStockValue,
    lowStockCount,
    lowStockProducts: lowStockProducts.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      quantityInStock: p.quantityInStock,
      reorderLevel: p.reorderLevel,
    })),
    categoryBreakdown,
    recentMovements: recentMovements.map((m) => ({
      id: m.id,
      productName: m.product.name,
      sku: m.product.sku,
      type: m.type,
      quantity: m.quantity,
      reason: m.reason,
      createdAt: m.createdAt,
    })),
  };
}
