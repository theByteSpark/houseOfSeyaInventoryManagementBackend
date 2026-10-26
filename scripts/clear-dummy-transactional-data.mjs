// One-off data wipe for this warehouse-based branch (paragon-resin-main) —
// distinct from scripts/wipe_prod_except_users_and_products.mjs, which is a
// much more destructive full reset (also deletes Warehouse, Category,
// Notifications, etc). This one is scoped to exactly what was asked:
// clear dummy Sale/Purchase/Customer/Vendor/Enquiry data while keeping the
// Product catalog, Warehouses, Categories, and every login/access row
// completely intact. Run manually, read the console output before
// confirming.
//
// Usage — MUST be run with the backend repo root as the current directory
// (dotenv only finds .env in the process's cwd, not next to this file):
//   cd /opt/paragonresin/backend
//   node scripts/clear-dummy-transactional-data.mjs --dry-run
//   node scripts/clear-dummy-transactional-data.mjs --confirm
//
// Deletes, in FK-safe order (children before parents):
//   BlockedQuantity    (references Sale -- must go before it)
//   SaleItem, Sale
//   PurchaseItem, Purchase
//   Enquiry
//   StockTransfer, StockConversion, StockMovement   (history of the
//     purchases/sales/adjustments being wiped -- no longer meaningful once
//     every ProductStock quantity below is reset to 0 and its source
//     Sale/Purchase rows are gone)
//   Vendor             (only safe once Purchase is gone)
//   Customer            (only safe once Sale is gone)
//
// Does NOT delete Product rows or ProductStock rows -- instead, EVERY
// ProductStock row has its quantity set to 0 via updateMany, so every
// product stays listed in every warehouse it was already stocked in, just
// with zero stock against it (matches the explicit ask: "each item present
// in every warehouse but there is no stock against it").
//
// NOT touched at all, deliberately:
//   User, PasswordResetToken, UserWarehouse   (login/access data)
//   Warehouse                                  (organizational structure, not dummy data)
//   Category                                   (dropdown metadata the app needs to keep operating)
//   Product                                    (the catalog itself -- kept, only its stock is zeroed)
//   Notification, NotificationRead              (not part of what was asked; no FK pressure from
//                                                 the tables above, since Notification only links to
//                                                 Warehouse, which is never deleted here)
//   Setting, FeatureFlag                        (app configuration, not business data)

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isDryRun = !process.argv.includes('--confirm');

async function main() {
  console.log(isDryRun ? '--- DRY RUN (no data will be deleted) ---' : '--- LIVE RUN — DELETING DATA ---');

  const counts = {
    blockedQuantity: await prisma.blockedQuantity.count(),
    saleItem: await prisma.saleItem.count(),
    sale: await prisma.sale.count(),
    purchaseItem: await prisma.purchaseItem.count(),
    purchase: await prisma.purchase.count(),
    enquiry: await prisma.enquiry.count(),
    stockTransfer: await prisma.stockTransfer.count(),
    stockConversion: await prisma.stockConversion.count(),
    stockMovement: await prisma.stockMovement.count(),
    vendor: await prisma.vendor.count(),
    customer: await prisma.customer.count(),
  };

  console.log('\nRows that will be deleted:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(16)} ${count}`);
  }

  const productStockCount = await prisma.productStock.count();
  const nonZeroStockCount = await prisma.productStock.count({ where: { quantity: { not: 0 } } });
  console.log(`\nProductStock rows that will be RESET TO 0 (not deleted): ${productStockCount} total, ${nonZeroStockCount} currently non-zero`);

  const keptUser = await prisma.user.count();
  const keptWarehouse = await prisma.warehouse.count();
  const keptCategory = await prisma.category.count();
  const keptProduct = await prisma.product.count();
  console.log('\nRows that will be KEPT, untouched:');
  console.log(`  user              ${keptUser}`);
  console.log(`  warehouse         ${keptWarehouse}`);
  console.log(`  category          ${keptCategory}`);
  console.log(`  product           ${keptProduct}`);

  if (isDryRun) {
    console.log('\nDry run only — re-run with --confirm to actually delete.');
    return;
  }

  console.log('\nDeleting...');

  await prisma.$transaction([
    prisma.blockedQuantity.deleteMany(),

    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),

    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),

    prisma.enquiry.deleteMany(),

    prisma.stockTransfer.deleteMany(),
    prisma.stockConversion.deleteMany(),
    prisma.stockMovement.deleteMany(),

    prisma.productStock.updateMany({ data: { quantity: 0 } }),

    prisma.vendor.deleteMany(),
    prisma.customer.deleteMany(),
  ]);

  console.log('Done.');

  const remaining = {
    sale: await prisma.sale.count(),
    purchase: await prisma.purchase.count(),
    enquiry: await prisma.enquiry.count(),
    vendor: await prisma.vendor.count(),
    customer: await prisma.customer.count(),
    productStockNonZero: await prisma.productStock.count({ where: { quantity: { not: 0 } } }),
    product: await prisma.product.count(),
    warehouse: await prisma.warehouse.count(),
    user: await prisma.user.count(),
  };
  console.log('\nFinal state:', remaining);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
