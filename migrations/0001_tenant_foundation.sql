-- TradeFlow pilot server store (Cloudflare D1). Not activated by this migration alone.
-- The authenticated issuer+subject comes only from a verified identity provider.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS businesses (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS business_memberships (
 business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','removed')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY (business_id,issuer,subject)
);
CREATE INDEX IF NOT EXISTS memberships_identity ON business_memberships(issuer,subject,status);
CREATE TABLE IF NOT EXISTS tenant_records (
 business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 record_type TEXT NOT NULL CHECK(record_type IN ('customers','jobs','quotes','invoices')),
 id TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 deleted_at TEXT,
 PRIMARY KEY (business_id,record_type,id)
);
CREATE INDEX IF NOT EXISTS tenant_records_updated ON tenant_records(business_id,updated_at);
CREATE TABLE IF NOT EXISTS tenant_audit_events (
 id TEXT PRIMARY KEY NOT NULL,
 business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 action TEXT NOT NULL,
 record_type TEXT,
 record_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS tenant_audit_by_business ON tenant_audit_events(business_id,created_at);
