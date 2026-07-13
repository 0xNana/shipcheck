CREATE TABLE IF NOT EXISTS verification_requests (
  request_id TEXT PRIMARY KEY,
  input JSONB NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')
  ),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  response JSONB,
  error JSONB
);

CREATE INDEX IF NOT EXISTS verification_requests_created_at_idx
  ON verification_requests (created_at);

CREATE TABLE IF NOT EXISTS receipts (
  receipt_id TEXT PRIMARY KEY,
  receipt JSONB NOT NULL,
  tested_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS receipts_tested_at_idx
  ON receipts (tested_at);

CREATE TABLE IF NOT EXISTS report_bundles (
  receipt_id TEXT PRIMARY KEY REFERENCES receipts (receipt_id) ON DELETE CASCADE,
  contract JSONB NOT NULL,
  results JSONB NOT NULL,
  receipt JSONB NOT NULL,
  evidence_manifest JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS report_bundles_created_at_idx
  ON report_bundles (created_at);

CREATE TABLE IF NOT EXISTS idempotency_entries (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'COMPLETED')),
  value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (namespace, key)
);

CREATE INDEX IF NOT EXISTS idempotency_entries_updated_at_idx
  ON idempotency_entries (updated_at);
