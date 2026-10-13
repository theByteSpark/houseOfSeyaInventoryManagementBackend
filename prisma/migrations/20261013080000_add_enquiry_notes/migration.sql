-- Free-text notes for anything the client says about a custom order that
-- doesn't fit the structured metal/diamond/selling-amount fields.
ALTER TABLE "Enquiry" ADD COLUMN "notes" TEXT;
