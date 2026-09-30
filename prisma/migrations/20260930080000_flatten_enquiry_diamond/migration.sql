-- An enquiry has at most one diamond block, not a repeatable list -- flatten
-- EnquiryDiamond onto Enquiry, same shape as the earlier Product diamond
-- flatten (20260925180000_flatten_product_diamond). All four stay nullable:
-- unlike Product, an enquiry can be recorded before diamond details are known.
ALTER TABLE "Enquiry" ADD COLUMN "diamondShape" TEXT;
ALTER TABLE "Enquiry" ADD COLUMN "diamondQuality" TEXT;
ALTER TABLE "Enquiry" ADD COLUMN "diamondPieces" INTEGER;
ALTER TABLE "Enquiry" ADD COLUMN "diamondCaratWeight" DECIMAL(10,3);

-- DropForeignKey
ALTER TABLE "EnquiryDiamond" DROP CONSTRAINT IF EXISTS "EnquiryDiamond_enquiryId_fkey";

-- DropTable
DROP TABLE "EnquiryDiamond";
