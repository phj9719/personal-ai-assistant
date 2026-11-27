BEGIN;

ALTER TABLE user_settings
  ADD COLUMN residence_start date,
  ADD COLUMN residence_end date,
  ADD CONSTRAINT user_settings_residence_period
    CHECK (residence_end IS NULL OR (residence_start IS NOT NULL AND residence_start <= residence_end));

ALTER TABLE utility_bills
  ALTER COLUMN total_amount DROP NOT NULL,
  ADD COLUMN usage_scope text NOT NULL DEFAULT 'reference' CHECK (usage_scope IN ('personal', 'reference')),
  ADD COLUMN note text,
  ADD CONSTRAINT utility_bills_reference_no_expense
    CHECK (bill_type NOT IN ('management', 'gas') OR usage_scope <> 'reference' OR transaction_id IS NULL) NOT VALID;

-- One independent bill of each kind per owner and billing month.
CREATE UNIQUE INDEX utility_bills_housing_month_unique
  ON utility_bills (user_id, billing_month, bill_type)
  WHERE bill_type IN ('management', 'gas');

ALTER TABLE utility_bill_items
  ALTER COLUMN amount DROP NOT NULL,
  ADD COLUMN item_code text,
  DROP CONSTRAINT utility_bill_items_amount_check,
  ADD CONSTRAINT utility_bill_items_amount_check
    CHECK (amount >= 0 OR item_code IS NOT DISTINCT FROM 'shared_electricity');

CREATE UNIQUE INDEX utility_bill_items_code_unique
  ON utility_bill_items (user_id, bill_id, item_code)
  WHERE item_code IS NOT NULL;

COMMIT;
