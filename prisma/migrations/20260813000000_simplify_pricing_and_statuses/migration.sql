-- Clean destructive migration on dev data: map old enum text values to
-- compatible new ones as part of the enum-swap USING clause (old values no
-- longer exist as enum labels once the type is recreated, so we translate
-- via text comparison here rather than updating rows against the old enum).

-- AlterEnum
BEGIN;
CREATE TYPE "PurchaseStatus_new" AS ENUM ('ORDERED', 'INWARD_TRANSIT', 'IN_STOCK', 'CANCELLED');
ALTER TABLE "Purchase" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Purchase" ALTER COLUMN "status" TYPE "PurchaseStatus_new" USING (
  CASE "status"::text
    WHEN 'DRAFT' THEN 'ORDERED'
    WHEN 'PARTIALLY_RECEIVED' THEN 'IN_STOCK'
    WHEN 'RECEIVED' THEN 'IN_STOCK'
    ELSE "status"::text
  END
)::"PurchaseStatus_new";
ALTER TYPE "PurchaseStatus" RENAME TO "PurchaseStatus_old";
ALTER TYPE "PurchaseStatus_new" RENAME TO "PurchaseStatus";
DROP TYPE "PurchaseStatus_old";
ALTER TABLE "Purchase" ALTER COLUMN "status" SET DEFAULT 'ORDERED';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SaleStatus_new" AS ENUM ('OUTWARD_TRANSIT', 'CANCELLED');
ALTER TABLE "Sale" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Sale" ALTER COLUMN "status" TYPE "SaleStatus_new" USING (
  CASE "status"::text
    WHEN 'DRAFT' THEN 'OUTWARD_TRANSIT'
    WHEN 'ISSUED' THEN 'OUTWARD_TRANSIT'
    WHEN 'PAID' THEN 'OUTWARD_TRANSIT'
    ELSE "status"::text
  END
)::"SaleStatus_new";
ALTER TYPE "SaleStatus" RENAME TO "SaleStatus_old";
ALTER TYPE "SaleStatus_new" RENAME TO "SaleStatus";
DROP TYPE "SaleStatus_old";
ALTER TABLE "Sale" ALTER COLUMN "status" SET DEFAULT 'OUTWARD_TRANSIT';
COMMIT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "unitPrice";

-- AlterTable
ALTER TABLE "Purchase" ALTER COLUMN "status" SET DEFAULT 'ORDERED';

-- AlterTable
ALTER TABLE "PurchaseItem" DROP COLUMN "receivedQuantity";

-- AlterTable
ALTER TABLE "Sale" ALTER COLUMN "status" SET DEFAULT 'OUTWARD_TRANSIT';
