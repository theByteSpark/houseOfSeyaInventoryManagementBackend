-- Rename InvoiceStatus enum to SaleStatus
ALTER TYPE "InvoiceStatus" RENAME TO "SaleStatus";

-- Rename Invoice -> Sale (table, column, constraints, indexes)
ALTER TABLE "Invoice" RENAME TO "Sale";
ALTER TABLE "Sale" RENAME COLUMN "invoiceNumber" TO "saleNumber";
ALTER TABLE "Sale" RENAME CONSTRAINT "Invoice_pkey" TO "Sale_pkey";
ALTER INDEX "Invoice_invoiceNumber_key" RENAME TO "Sale_saleNumber_key";
ALTER TABLE "Sale" RENAME CONSTRAINT "Invoice_customerId_fkey" TO "Sale_customerId_fkey";

-- Rename InvoiceItem -> SaleItem (table, column, constraints)
ALTER TABLE "InvoiceItem" RENAME TO "SaleItem";
ALTER TABLE "SaleItem" RENAME COLUMN "invoiceId" TO "saleId";
ALTER TABLE "SaleItem" RENAME CONSTRAINT "InvoiceItem_pkey" TO "SaleItem_pkey";
ALTER TABLE "SaleItem" RENAME CONSTRAINT "InvoiceItem_invoiceId_fkey" TO "SaleItem_saleId_fkey";
ALTER TABLE "SaleItem" RENAME CONSTRAINT "InvoiceItem_productId_fkey" TO "SaleItem_productId_fkey";
