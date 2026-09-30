-- CreateTable
-- The buying-side counterpart to Enquiry -- same shape, Vendor instead of
-- Customer. Diamond fields are flat from the start (Enquiry only got there
-- via a later flatten migration).
CREATE TABLE "PurchaseEnquiry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "metalType" TEXT NOT NULL,
    "grossWeight" DECIMAL(10,3) NOT NULL,
    "diamondShape" TEXT,
    "diamondQuality" TEXT,
    "diamondPieces" INTEGER,
    "diamondCaratWeight" DECIMAL(10,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseEnquiry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseEnquiry" ADD CONSTRAINT "PurchaseEnquiry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEnquiry" ADD CONSTRAINT "PurchaseEnquiry_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
