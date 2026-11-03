-- TRP P0-AUD-01: candidate PostgreSQL authoritative audit ledger.
-- DESIGN ONLY. Not executed against any database. Requires security review and approved connection.
-- Event payload MUST be redacted before storage; no secrets, credentials, or raw PII.
CREATE TABLE IF NOT EXISTS trp_audit_ledger (
  ledger_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL CHECK (length(organization_id) BETWEEN 1 AND 240),
  audit_operation_id text NOT NULL CHECK (length(audit_operation_id) BETWEEN 1 AND 240),
  immutable_sha256 char(64) NOT NULL CHECK (immutable_sha256 ~ '^[0-9a-f]{64}$'),
  event_payload jsonb NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trp_audit_ledger_operation_uniq UNIQUE (organization_id, audit_operation_id)
);
CREATE INDEX IF NOT EXISTS trp_audit_ledger_org_time
  ON trp_audit_ledger (organization_id, inserted_at DESC);

-- Atomic writer (inside privileged server-side function, never from a browser):
-- INSERT INTO trp_audit_ledger
--   (organization_id, audit_operation_id, immutable_sha256, event_payload)
-- VALUES ($1, $2, $3, $4::jsonb)
-- ON CONFLICT (organization_id, audit_operation_id) DO NOTHING
-- RETURNING ledger_id, immutable_sha256, event_payload;
--
-- If RETURNING is empty, SELECT immutable_sha256 and event under the same key;
-- equal hash is an idempotent duplicate; a different hash MUST return
-- AUDIT_OPERATION_ID_COLLISION and fail closed. Never overwrite historical audit content.
-- A unique constraint, not the SELECT, provides the concurrency guarantee.
-- Production must also define database permissions, retention, backup, health monitoring,
-- fail-closed failure policy, and reconciliation of any Base44 read-only mirror.
