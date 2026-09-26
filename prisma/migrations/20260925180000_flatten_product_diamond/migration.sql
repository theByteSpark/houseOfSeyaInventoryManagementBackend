-- A product has exactly one diamond block, not a repeatable list -- flatten ProductDiamond onto Product
ALTER TABLE "Product" ADD COLUMN "diamondShape" TEXT;
ALTER TABLE "Product" ADD COLUMN "diamondQuality" TEXT;
ALTER TABLE "Product" ADD COLUMN "diamondPieces" INTEGER;
ALTER TABLE "Product" ADD COLUMN "diamondCaratWeight" DECIMAL(10,3);
ALTER TABLE "Product" ADD COLUMN "diamondWeight" DECIMAL(10,3);
ALTER TABLE "Product" ADD COLUMN "diamondRate" DECIMAL(10,2);

-- DropForeignKey
ALTER TABLE "ProductDiamond" DROP CONSTRAINT IF EXISTS "ProductDiamond_productId_fkey";

-- DropTable
DROP TABLE "ProductDiamond";
