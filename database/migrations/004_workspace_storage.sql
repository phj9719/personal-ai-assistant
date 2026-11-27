BEGIN;

-- The current UI groups related edits as a single domain document.
CREATE TABLE workspace_documents (
  user_id uuid NOT NULL REFERENCES users(id),
  domain text NOT NULL CHECK (domain IN ('records','utilities','finance','chat','memories','theme')),
  payload jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,domain),
  CHECK (
    (domain IN ('records','utilities','finance') AND jsonb_typeof(payload) = 'object')
    OR (domain IN ('chat','memories') AND jsonb_typeof(payload) = 'array')
    OR (domain = 'theme' AND payload IN ('"light"'::jsonb,'"dark"'::jsonb))
  )
);

CREATE TABLE workspace_imports (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_lower_email_unique ON users (lower(email));

COMMIT;
