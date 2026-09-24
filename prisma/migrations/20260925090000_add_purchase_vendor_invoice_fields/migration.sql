-- Record the vendor's own invoice number/date on a purchase
ALTER TABLE "Purchase" ADD COLUMN "vendorInvoiceNumber" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "vendorInvoiceDate" TIMESTAMP(3);
