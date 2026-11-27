BEGIN;

CREATE TABLE finance_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('bank','card')),
  institution text NOT NULL,
  label text NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,id)
);

CREATE TABLE finance_expense_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('consumption','savings','investment')),
  method text NOT NULL CHECK (method IN ('transfer','debit','card')),
  account_id uuid,
  amount_mode text NOT NULL CHECK (amount_mode IN ('fixed','variable','daily')),
  rate_or_estimate numeric(15,2) CHECK (rate_or_estimate >= 0),
  minimum_amount numeric(15,2) CHECK (minimum_amount >= 0),
  maximum_amount numeric(15,2) CHECK (maximum_amount >= 0),
  timing text NOT NULL CHECK (timing IN ('exact','approximate','unspecified')),
  day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 31),
  starts_on date NOT NULL,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  utility_kind text CHECK (utility_kind IN ('management','gas') AND purpose='consumption'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,id),
  FOREIGN KEY (user_id,account_id) REFERENCES finance_payment_accounts(user_id,id),
  CHECK (starts_on <= ends_on),
  CHECK ((timing='unspecified') = (day_of_month IS NULL)),
  CHECK ((minimum_amount IS NULL) = (maximum_amount IS NULL)),
  CHECK (minimum_amount <= maximum_amount),
  CHECK (rate_or_estimate BETWEEN minimum_amount AND maximum_amount OR minimum_amount IS NULL),
  CHECK (amount_mode='variable' OR (rate_or_estimate IS NOT NULL AND minimum_amount IS NULL))
);

CREATE TABLE finance_expense_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  rule_id uuid NOT NULL,
  billing_month date NOT NULL CHECK (EXTRACT(DAY FROM billing_month)=1),
  title text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('consumption','savings','investment')),
  method text NOT NULL CHECK (method IN ('transfer','debit','card')),
  account_id uuid,
  amount_mode text NOT NULL CHECK (amount_mode IN ('fixed','variable','daily')),
  rate_or_estimate numeric(15,2) CHECK (rate_or_estimate >= 0),
  minimum_amount numeric(15,2) CHECK (minimum_amount >= 0),
  maximum_amount numeric(15,2) CHECK (maximum_amount >= 0),
  timing text NOT NULL CHECK (timing IN ('exact','approximate','unspecified')),
  due_on date,
  period_start date NOT NULL,
  period_end date NOT NULL,
  paid_on date,
  paid_amount numeric(15,2) CHECK (paid_amount >= 0),
  utility_kind text CHECK (utility_kind IN ('management','gas') AND purpose='consumption'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,rule_id,billing_month),
  FOREIGN KEY (user_id,rule_id) REFERENCES finance_expense_rules(user_id,id),
  FOREIGN KEY (user_id,account_id) REFERENCES finance_payment_accounts(user_id,id),
  CHECK ((paid_on IS NULL) = (paid_amount IS NULL)),
  CHECK (period_end - period_start BETWEEN 0 AND 365),
  CHECK ((timing='unspecified') = (due_on IS NULL)),
  CHECK (due_on >= billing_month AND due_on < (billing_month + interval '1 month')::date),
  CHECK ((minimum_amount IS NULL) = (maximum_amount IS NULL)),
  CHECK (minimum_amount <= maximum_amount),
  CHECK (rate_or_estimate BETWEEN minimum_amount AND maximum_amount OR minimum_amount IS NULL),
  CHECK (amount_mode='variable' OR (rate_or_estimate IS NOT NULL AND minimum_amount IS NULL))
);

CREATE UNIQUE INDEX finance_expense_months_utility_once
  ON finance_expense_months (user_id,billing_month,utility_kind)
  WHERE utility_kind IS NOT NULL;
CREATE INDEX finance_expense_months_paid_idx ON finance_expense_months (user_id,paid_on);

CREATE TABLE finance_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('savings','investment')),
  transferred_on date NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('transfer','debit','card')),
  account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id,account_id) REFERENCES finance_payment_accounts(user_id,id)
);
CREATE INDEX finance_transfers_date_idx ON finance_transfers (user_id,transferred_on);

CREATE TRIGGER finance_payment_accounts_set_updated_at BEFORE UPDATE ON finance_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER finance_expense_rules_set_updated_at BEFORE UPDATE ON finance_expense_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER finance_expense_months_set_updated_at BEFORE UPDATE ON finance_expense_months
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER finance_transfers_set_updated_at BEFORE UPDATE ON finance_transfers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
