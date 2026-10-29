-- Phase 3: write attribution and in-transaction audit for tenant records.
-- Requires 0001_tenant_foundation.sql. Run only on an isolated pilot D1 database.
ALTER TABLE tenant_records ADD COLUMN updated_by_issuer TEXT;
ALTER TABLE tenant_records ADD COLUMN updated_by_subject TEXT;
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
