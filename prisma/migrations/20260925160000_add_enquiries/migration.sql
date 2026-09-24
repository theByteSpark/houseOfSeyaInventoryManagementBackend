-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "metalType" TEXT NOT NULL,
    "grossWeight" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryDiamond" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "caratWeight" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryDiamond_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnquiryDiamond_enquiryId_idx" ON "EnquiryDiamond"("enquiryId");

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryDiamond" ADD CONSTRAINT "EnquiryDiamond_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
