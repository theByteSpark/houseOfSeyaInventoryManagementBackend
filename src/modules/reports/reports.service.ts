import type { Prisma } from '@prisma/client';
import { SaleStatus, PurchaseStatus } from '@prisma/client';
import { prisma } from '@/config/db';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { isCompanyLevel } from '@/utils/warehouseScope';

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

// Warehouse-scoped roles (USER/ADMIN) are always locked to their own warehouse.
// Company-level roles (COMPANY_ADMIN/SUPER_ADMIN) see everything by default, but
// may narrow to one warehouse via the optional `warehouseId` filter param.
function scopeSaleWarehouseWhere(user: AuthenticatedUser, warehouseId?: string): Prisma.SaleWhereInput {
  if (!isCompanyLevel(user)) return { warehouseId: user.warehouseId ?? '__none__' };
  return warehouseId ? { warehouseId } : {};
}

function scopePurchaseWarehouseWhere(user: AuthenticatedUser, warehouseId?: string): Prisma.PurchaseWhereInput {
  if (!isCompanyLevel(user)) return { warehouseId: user.warehouseId ?? '__none__' };
  return warehouseId ? { warehouseId } : {};
}

export async function getSalesReport(
  user: AuthenticatedUser,
  from?: string,
  to?: string,
  status?: string,
  warehouseId?: string,
) {
  const { fromDate, toDate } = parseDateRange(from, to);
  const dateFilter = buildSaleDateFilter(fromDate, toDate);

  const statusFilter: Prisma.SaleWhereInput =
    status && status !== 'ALL' ? { status: status as SaleStatus } : {};

  const where: Prisma.SaleWhereInput = { AND: [dateFilter, statusFilter, scopeSaleWarehouseWhere(user, warehouseId)] };

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

export async function getPurchasesReport(
  user: AuthenticatedUser,
  from?: string,
  to?: string,
  status?: string,
  warehouseId?: string,
) {
  const { fromDate, toDate } = parseDateRange(from, to);
  const dateFilter = buildPurchaseDateFilter(fromDate, toDate);

  const statusFilter: Prisma.PurchaseWhereInput =
    status && status !== 'ALL' ? { status: status as PurchaseStatus } : {};

  const where: Prisma.PurchaseWhereInput = {
    AND: [dateFilter, statusFilter, scopePurchaseWarehouseWhere(user, warehouseId)],
  };

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

export async function getInventoryReport(user: AuthenticatedUser, warehouseIdFilter?: string) {
  const warehouseId = isCompanyLevel(user) ? warehouseIdFilter : (user.warehouseId ?? '__none__');
  const stockWhere: Prisma.ProductStockWhereInput = warehouseId ? { warehouseId } : {};

  const [products, categories, recentMovements] = await Promise.all([
    prisma.product.findMany({
      include: {
        category: { select: { name: true } },
        stocks: { where: stockWhere },
      },
    }),
    prisma.category.findMany({
      include: { _count: { select: { products: true } } },
    }),
    prisma.stockMovement.findMany({
      where: warehouseId ? { warehouseId } : {},
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, sku: true } } },
    }),
  ]);

  const withQuantity = products.map((p) => ({
    ...p,
    quantityInStock: p.stocks.reduce((sum, s) => sum + s.quantity, 0),
  }));

  // Pricing now lives on transaction line items, not the Product master
  // record, so there's no per-product price to value stock against here.
  const lowStockProducts = withQuantity
    .filter((p) => p.quantityInStock <= p.reorderLevel)
    .sort((a, b) => a.quantityInStock - b.quantityInStock)
    .slice(0, 20);

  const categoryBreakdown = categories.map((cat) => {
    const categoryProducts = withQuantity.filter((p) => p.category?.name === cat.name);
    return {
      category: cat.name,
      productCount: cat._count.products,
      totalQuantity: categoryProducts.reduce((sum, p) => sum + p.quantityInStock, 0),
    };
  });

  return {
    totalProducts: withQuantity.length,
    lowStockCount: lowStockProducts.length,
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

// Sales line items from the last N days, listed by product (not by
// customer), sorted by sale date descending. Backs the new dashboard's
// "recent sales" table.
export async function getRecentSalesByProduct(
  user: AuthenticatedUser,
  days = 3,
  warehouseId?: string,
) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const where: Prisma.SaleWhereInput = {
    AND: [{ createdAt: { gte: since } }, scopeSaleWarehouseWhere(user, warehouseId)],
  };

  const saleItems = await prisma.saleItem.findMany({
    where: { sale: where },
    include: {
      product: { select: { id: true, name: true } },
      sale: { select: { createdAt: true } },
    },
    orderBy: { sale: { createdAt: 'desc' } },
  });

  return saleItems.map((item) => ({
    productId: item.productId,
    productName: item.product.name,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    date: item.sale.createdAt,
  }));
}
