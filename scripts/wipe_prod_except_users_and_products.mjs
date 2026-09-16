// One-off production data wipe: deletes everything except User and Product
// rows. Product rows are kept with their catalog fields intact (name, sku,
// description, reorderLevel, category) but all stock/warehouse-linked data
// is removed, so every product ends up with zero stock and no warehouse
// assignment. Run manually, read the console output before confirming.
//
// Usage:
//   DATABASE_URL="postgresql://..." node scripts/wipe_prod_except_users_and_products.mjs --dry-run
//   DATABASE_URL="postgresql://..." node scripts/wipe_prod_except_users_and_products.mjs --confirm
//
// Deletes, in FK-safe order (children before parents):
//   NotificationRead, Notification
//   PasswordResetToken   (kept — belongs to User, NOT deleted; see note below)
//   SaleItem, Sale
//   PurchaseItem, Purchase
//   Enquiry
//   StockTransfer
//   StockConversion
//   StockMovement
//   ProductStock
//   UserWarehouse
//   Warehouse
//   Customer
//   Vendor
//   Category           (Product.categoryId set to null first)
//
// NOT deleted: User, Product, PasswordResetToken, Setting, FeatureFlag.
// PasswordResetToken references User and isn't part of the "everything
// except users/products" business data — left alone deliberately. Remove it
// too if you want a truly clean slate on auth-adjacent tables as well.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isDryRun = !process.argv.includes('--confirm');

async function main() {
  console.log(isDryRun ? '--- DRY RUN (no data will be deleted) ---' : '--- LIVE RUN — DELETING DATA ---');

  const counts = {
    notificationRead: await prisma.notificationRead.count(),
    notification: await prisma.notification.count(),
    saleItem: await prisma.saleItem.count(),
    sale: await prisma.sale.count(),
    purchaseItem: await prisma.purchaseItem.count(),
    purchase: await prisma.purchase.count(),
    enquiry: await prisma.enquiry.count(),
    stockTransfer: await prisma.stockTransfer.count(),
    stockConversion: await prisma.stockConversion.count(),
    stockMovement: await prisma.stockMovement.count(),
    productStock: await prisma.productStock.count(),
    userWarehouse: await prisma.userWarehouse.count(),
    warehouse: await prisma.warehouse.count(),
    customer: await prisma.customer.count(),
    vendor: await prisma.vendor.count(),
    category: await prisma.category.count(),
  };

  console.log('\nRows that will be deleted:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(16)} ${count}`);
  }

  const keptUsers = await prisma.user.count();
  const keptProducts = await prisma.product.count();
  console.log('\nRows that will be KEPT:');
  console.log(`  user             ${keptUsers}`);
  console.log(`  product          ${keptProducts} (categoryId will be cleared)`);

  if (isDryRun) {
    console.log('\nDry run only — re-run with --confirm to actually delete.');
    return;
  }

  console.log('\nDeleting...');

  await prisma.$transaction([
    prisma.notificationRead.deleteMany(),
    prisma.notification.deleteMany(),

    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),

    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),

    prisma.enquiry.deleteMany(),
    prisma.stockTransfer.deleteMany(),
    prisma.stockConversion.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.productStock.deleteMany(),

    prisma.userWarehouse.deleteMany(),
    prisma.warehouse.deleteMany(),

    prisma.customer.deleteMany(),
    prisma.vendor.deleteMany(),

    // Detach products from categories before removing categories.
    prisma.product.updateMany({ data: { categoryId: null } }),
    prisma.category.deleteMany(),
  ]);

  console.log('Done.');

  const remaining = {
    user: await prisma.user.count(),
    product: await prisma.product.count(),
    warehouse: await prisma.warehouse.count(),
    sale: await prisma.sale.count(),
    purchase: await prisma.purchase.count(),
    customer: await prisma.customer.count(),
    vendor: await prisma.vendor.count(),
  };
  console.log('\nFinal state:', remaining);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
