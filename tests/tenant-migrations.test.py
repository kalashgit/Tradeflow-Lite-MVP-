import pathlib, sqlite3

root = pathlib.Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
for migration in ("0001_tenant_foundation.sql", "0002_record_audit.sql"):
    db.executescript((root / "migrations" / migration).read_text())

db.execute("INSERT INTO businesses(id,name) VALUES (?,?)", ("business_001","Pilot Company"))
db.execute("INSERT INTO businesses(id,name) VALUES (?,?)", ("business_002","Other Company"))
sql = """
INSERT INTO tenant_records
(business_id,record_type,id,revision,payload,updated_by_issuer,updated_by_subject)
SELECT ?,?,?,?,?,?,? WHERE ?=0 OR EXISTS
(SELECT 1 FROM tenant_records WHERE business_id=? AND record_type=? AND id=?)
ON CONFLICT(business_id,record_type,id) DO UPDATE SET
payload=excluded.payload,revision=tenant_records.revision+1,
updated_at=datetime('now'),updated_by_issuer=excluded.updated_by_issuer,
updated_by_subject=excluded.updated_by_subject
WHERE tenant_records.revision=? AND tenant_records.deleted_at IS NULL
RETURNING revision,updated_at
"""

def save(business, expected, payload):
    return db.execute(sql,(business,"jobs","job_001",expected+1,payload,"issuer.example","user_001",expected,business,"jobs","job_001",expected)).fetchone()

assert save("business_001",0,'{"name":"First"}')[0]==1
assert save("business_001",0,'{"name":"Stale"}') is None
assert save("business_001",1,'{"name":"Second"}')[0]==2
assert save("business_001",4,'{"name":"Invalid revision"}') is None
assert save("business_002",1,'{"name":"Wrong business"}') is None
assert save("business_002",0,'{"name":"Separate record"}')[0]==1
rows=db.execute("SELECT business_id,revision,payload FROM tenant_records ORDER BY business_id").fetchall()
assert rows==[("business_001",2,'{"name":"Second"}'),("business_002",1,'{"name":"Separate record"}')]
audit=db.execute("SELECT business_id,action,issuer,subject FROM tenant_audit_events ORDER BY created_at,id").fetchall()
assert len(audit)==3,audit
assert {r[1] for r in audit}=={"record.create","record.update"}
assert all(r[2:]==("issuer.example","user_001") for r in audit)
print("PASS: D1-compatible schema, create/update revisions, isolation, and transactional audit")
