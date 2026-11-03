-- TF-R01-02B: DEVELOPMENT-ONLY job-scoped access grants.
-- Source-controlled migration; never apply to production without separate approval.
-- A grant is not itself an executable command or proof of current access.
CREATE TABLE IF NOT EXISTS job_access_grants (
 business_id TEXT NOT NULL,
 record_type TEXT NOT NULL DEFAULT 'jobs' CHECK(record_type='jobs'),
 job_id TEXT NOT NULL,
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('crew','office')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 grant_revision INTEGER NOT NULL DEFAULT 1 CHECK(grant_revision>0),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 granted_by_issuer TEXT NOT NULL,
 granted_by_subject TEXT NOT NULL,
 PRIMARY KEY (business_id,job_id,issuer,subject,scope),
 FOREIGN KEY (business_id,issuer,subject)
  REFERENCES business_memberships(business_id,issuer,subject) ON DELETE CASCADE,
 FOREIGN KEY (business_id,record_type,job_id)
  REFERENCES tenant_records(business_id,record_type,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS job_access_by_principal
 ON job_access_grants(business_id,issuer,subject,status,scope,job_id);
