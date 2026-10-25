// One-off data wipe: clears every Sale, Purchase, Purchase Order
// (PurchaseEnquiry), Enquiry, Customer, Vendor, Product, and StockMovement
// row — the transactional records and inventory catalog entered as
// dummy/test data before go-live. Run manually, read the console output
// before confirming.
//
// Usage — MUST be run with the backend repo root as the current directory
// (same requirement as the app itself, see brain/deployment/troubleshooting-checklist.md
// #1 — dotenv only finds .env in the process's cwd, not next to this file):
//   cd /opt/houseofseya_inventory/backend
//   node scripts/clear-dummy-transactional-data.mjs --dry-run
//   node scripts/clear-dummy-transactional-data.mjs --confirm
//
// Deletes, in FK-safe order (children before parents):
//   SaleItem, Sale
//   PurchaseItem, Purchase
//   PurchaseEnquiry
//   Enquiry
//   StockMovement      (references Product -- must go before it)
//   Product
//   Vendor             (only safe once Purchase/PurchaseEnquiry are gone)
//   Customer            (only safe once Sale/Enquiry are gone)
//
// NOT touched, deliberately — not transactional/dummy data, and the app
// needs these to keep operating:
//   User, PasswordResetToken   (login data)
//   Category, Subcategory, AttributeOption   (dropdown metadata)

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isDryRun = !process.argv.includes('--confirm');

async function main() {
  console.log(isDryRun ? '--- DRY RUN (no data will be deleted) ---' : '--- LIVE RUN — DELETING DATA ---');

  const counts = {
    saleItem: await prisma.saleItem.count(),
    sale: await prisma.sale.count(),
    purchaseItem: await prisma.purchaseItem.count(),
    purchase: await prisma.purchase.count(),
    purchaseEnquiry: await prisma.purchaseEnquiry.count(),
    enquiry: await prisma.enquiry.count(),
    stockMovement: await prisma.stockMovement.count(),
    product: await prisma.product.count(),
    vendor: await prisma.vendor.count(),
    customer: await prisma.customer.count(),
  };

  console.log('\nRows that will be deleted:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(16)} ${count}`);
  }

  const keptUser = await prisma.user.count();
  const keptCategory = await prisma.category.count();
  const keptSubcategory = await prisma.subcategory.count();
  const keptAttributeOption = await prisma.attributeOption.count();
  console.log('\nRows that will be KEPT, untouched:');
  console.log(`  user              ${keptUser}`);
  console.log(`  category          ${keptCategory}`);
  console.log(`  subcategory       ${keptSubcategory}`);
  console.log(`  attributeOption   ${keptAttributeOption}`);

  if (isDryRun) {
    console.log('\nDry run only — re-run with --confirm to actually delete.');
    return;
  }

  console.log('\nDeleting...');

  await prisma.$transaction([
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),

    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),

    prisma.purchaseEnquiry.deleteMany(),
    prisma.enquiry.deleteMany(),

    prisma.stockMovement.deleteMany(),
    prisma.product.deleteMany(),

    prisma.vendor.deleteMany(),
    prisma.customer.deleteMany(),
  ]);

  console.log('Done.');

  const remaining = {
    sale: await prisma.sale.count(),
    purchase: await prisma.purchase.count(),
    purchaseEnquiry: await prisma.purchaseEnquiry.count(),
    enquiry: await prisma.enquiry.count(),
    stockMovement: await prisma.stockMovement.count(),
    product: await prisma.product.count(),
    vendor: await prisma.vendor.count(),
    customer: await prisma.customer.count(),
    user: await prisma.user.count(),
    category: await prisma.category.count(),
  };
  console.log('\nFinal state:', remaining);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
