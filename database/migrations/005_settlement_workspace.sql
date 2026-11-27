BEGIN;

ALTER TABLE workspace_documents
  DROP CONSTRAINT workspace_documents_domain_check,
  DROP CONSTRAINT workspace_documents_check,
  ADD CONSTRAINT workspace_documents_domain_check
    CHECK (domain IN ('records','utilities','finance','chat','memories','theme','settlements')),
  ADD CONSTRAINT workspace_documents_check CHECK (
    (domain IN ('records','utilities','finance') AND jsonb_typeof(payload) = 'object')
    OR (domain IN ('chat','memories','settlements') AND jsonb_typeof(payload) = 'array')
    OR (domain = 'theme' AND payload IN ('"light"'::jsonb,'"dark"'::jsonb))
  );

COMMIT;
