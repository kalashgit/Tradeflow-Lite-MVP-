-- PREPARED ONLY: apply using an atomic migration runner after a verified backup.
-- Does not enable extended API writes; TF_EXTENDED_RECORDS_ENABLED stays false.
-- Copies existing payloads, revisions, tombstones and attribution without reissuing audit events.
CREATE TABLE tenant_records_expanded (
 business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 record_type TEXT NOT NULL CHECK(record_type IN ('customers','jobs','quotes','invoices','tasks','payments','expenses','jobCosts','opportunities','suppliers','supplyOrders','crew','calendars','calendarEntries','calendarProposals','calendarPreferences','routePlans','marketingCampaigns','pins','events')),
 id TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 deleted_at TEXT,
 updated_by_issuer TEXT,
 updated_by_subject TEXT,
 PRIMARY KEY (business_id,record_type,id)
);
INSERT INTO tenant_records_expanded
 (business_id,record_type,id,revision,payload,updated_at,deleted_at,updated_by_issuer,updated_by_subject)
SELECT business_id,record_type,id,revision,payload,updated_at,deleted_at,updated_by_issuer,updated_by_subject
FROM tenant_records;
DROP TRIGGER IF EXISTS tenant_record_create_audit;
DROP TRIGGER IF EXISTS tenant_record_update_audit;
DROP TABLE tenant_records;
ALTER TABLE tenant_records_expanded RENAME TO tenant_records;
CREATE INDEX tenant_records_updated ON tenant_records(business_id,updated_at);
CREATE TRIGGER IF NOT EXISTS tenant_record_create_audit AFTER INSERT ON tenant_records
WHEN NEW.updated_by_issuer IS NOT NULL AND NEW.updated_by_subject IS NOT NULL
BEGIN
 INSERT INTO tenant_audit_events (id,business_id,issuer,subject,action,record_type,record_id)
 VALUES (lower(hex(randomblob(16))),NEW.business_id,NEW.updated_by_issuer,NEW.updated_by_subject,'record.create',NEW.record_type,NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS tenant_record_update_audit AFTER UPDATE ON tenant_records
WHEN NEW.updated_by_issuer IS NOT NULL AND NEW.updated_by_subject IS NOT NULL
BEGIN
 INSERT INTO tenant_audit_events (id,business_id,issuer,subject,action,record_type,record_id)
 VALUES (lower(hex(randomblob(16))),NEW.business_id,NEW.updated_by_issuer,NEW.updated_by_subject,'record.update',NEW.record_type,NEW.id);
END;
