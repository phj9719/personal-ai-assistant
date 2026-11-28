BEGIN;

-- The UI stores its data in workspace_documents. Keep the relational schema
-- ready for the same per-scope invoice keys and optional parking item_code.
CREATE UNIQUE INDEX utility_bills_housing_month_scope_unique
  ON utility_bills (user_id, billing_month, bill_type, usage_scope)
  WHERE bill_type IN ('management', 'gas');

DROP INDEX utility_bills_housing_month_unique;

ALTER TABLE utility_bills
  ADD COLUMN parking_in_base boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT utility_bills_management_parking CHECK (NOT parking_in_base OR bill_type = 'management');

COMMIT;
