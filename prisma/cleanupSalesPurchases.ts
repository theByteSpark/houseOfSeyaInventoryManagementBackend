// ============================================================================
// DO NOT RUN THIS WITHOUT ASKING FIRST.
//
// This permanently deletes real data (Sales, Purchases, Customers, Vendors)
// and zeroes every product's stock, on whatever database DATABASE_URL points
// at — there is no dry-run mode and no undo. Get explicit confirmation from
// whoever owns that decision (and a fresh backup) before running it, even if
// you're confident it's the right database. The --yes flag below only
// prevents an *accidental* run (e.g. a stray copy-pasted command) — it is
// not permission to run it; that has to come from a person, every time.
// ============================================================================
//
// One-off cleanup script: wipes all Sales, Purchases, Customers, and Vendors
// (and everything derived from them) while leaving every Product row in
// place, with its stock quantity reset to 0 at every warehouse. Meant for
// clearing out test/demo data before a client goes live with a clean slate.
//
// DESTRUCTIVE AND IRREVERSIBLE. Back up the database before running this
// against anything you care about. Requires an explicit --yes flag so it
// can never run by accident (e.g. as a stray `tsx` call or a copy-pasted
// command missing the flag).
//
// Usage:
//   npx tsx prisma/cleanupSalesPurchases.ts --yes
// or, with the npm script added below:
//   npm run db:cleanup-transactions -- --yes

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.warn('DO NOT RUN THIS WITHOUT ASKING FIRST — see the warning at the top of this file.');

  if (!process.argv.includes('--yes')) {
    console.error(
      'Refusing to run without --yes. This permanently deletes all Sales, Purchases, ' +
        'Customers, and Vendors, and zeroes every product\'s stock. Re-run with --yes to confirm.',
    );
    process.exit(1);
  }

  const [
    saleCount,
    purchaseCount,
    saleItemCount,
    purchaseItemCount,
    blockedQuantityCount,
    stockMovementCount,
    customerCount,
    vendorCount,
  ] = await Promise.all([
    prisma.sale.count(),
    prisma.purchase.count(),
    prisma.saleItem.count(),
    prisma.purchaseItem.count(),
    prisma.blockedQuantity.count(),
    prisma.stockMovement.count(),
    prisma.customer.count(),
    prisma.vendor.count(),
  ]);

  console.log('About to permanently delete:');
  console.log(`  ${saleCount} sales (${saleItemCount} line items)`);
  console.log(`  ${purchaseCount} purchases (${purchaseItemCount} line items)`);
  console.log(`  ${blockedQuantityCount} blocked-quantity records (all of them, not just sale-linked ones)`);
  console.log(`  ${stockMovementCount} stock movement history rows`);
  console.log(`  ${customerCount} customers`);
  console.log(`  ${vendorCount} vendors`);
  console.log('...and reset every ProductStock row\'s quantity to 0. Products, Categories, Warehouses,');
  console.log('Users, Enquiries, StockTransfers, and StockConversions are left untouched.');

  await prisma.$transaction([
    // Children before parents — no onDelete cascade is defined in the schema.
    // BlockedQuantity.saleId is a nullable FK to Sale, so every blocked-
    // quantity row must go before Sale can be deleted, not just sale-linked
    // ones (a block with no stock left to reserve isn't meaningful either).
    prisma.blockedQuantity.deleteMany({}),
    prisma.saleItem.deleteMany({}),
    prisma.sale.deleteMany({}),
    prisma.purchaseItem.deleteMany({}),
    prisma.purchase.deleteMany({}),
    // Customer/Vendor are only ever referenced by Sale/Purchase, which are
    // now gone, so these are safe to delete without touching anything else.
    prisma.customer.deleteMany({}),
    prisma.vendor.deleteMany({}),
    // Not FK-required (StockMovement only references Sale/Purchase by a free-
    // text `reason` string, not a real relation), but left in place these
    // rows would be orphaned audit trail pointing at sales/purchases that no
    // longer exist — clearing them keeps the ledger consistent with a
    // reset-to-zero inventory.
    prisma.stockMovement.deleteMany({}),
    prisma.productStock.updateMany({ data: { quantity: 0 } }),
  ]);

  console.log('Done. Every product stayed; every warehouse\'s stock quantity is now 0.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
