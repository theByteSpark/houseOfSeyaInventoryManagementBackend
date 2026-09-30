-- Client wants the expected selling amount captured at enquiry registration
-- time, so it can show on the Dashboard's Enquiry section. Nullable in the
-- DB (existing rows have none), required going forward in validation --
-- same pattern used for every other "add a required field" change this
-- session.
ALTER TABLE "Enquiry" ADD COLUMN "sellingAmount" DECIMAL(10,2);
