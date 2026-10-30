import pathlib, sqlite3, re

root = pathlib.Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
for migration in ("0001_tenant_foundation.sql", "0002_record_audit.sql"):
    db.executescript((root / "migrations" / migration).read_text())

db.execute("INSERT INTO businesses(id,name) VALUES (?,?)", ("business_001","Pilot Company"))
db.execute("INSERT INTO businesses(id,name) VALUES (?,?)", ("business_002","Other Company"))
source = (root / "src" / "tenant-record-store.js").read_text()
sql = re.search(r"export const RECORD_WRITE_SQL =`(.*?)`;", source, re.S).group(1)
for business in ("business_001", "business_002"):
    db.execute("INSERT INTO business_memberships(business_id,issuer,subject,role) VALUES (?,?,?,?)", (business,"issuer.example","user_001","owner"))


def save(business, expected, payload):
    return db.execute(sql,(business,"jobs","job_001",expected+1,payload,"issuer.example","user_001",expected,business,"jobs","job_001",business,"issuer.example","user_001",expected)).fetchone()

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

# Membership revocation is enforced inside the write statement, including stale pre-authorized requests.
db.execute("UPDATE business_memberships SET status='suspended' WHERE business_id='business_001'")
assert save("business_001",2,'{"name":"Revoked write"}') is None
assert db.execute("SELECT COUNT(*) FROM tenant_audit_events").fetchone()[0]==3
print("PASS: execution-time membership revocation cannot write or add audit events")

# Prepared expansion preserves the exact existing rows and audit history, atomically.
before_records=db.execute("SELECT * FROM tenant_records ORDER BY business_id,record_type,id").fetchall()
before_audit=db.execute("SELECT * FROM tenant_audit_events ORDER BY id").fetchall()
expansion=(root / "migrations" / "0003_extended_business_records.sql").read_text()
db.commit()
try:
    db.executescript("BEGIN IMMEDIATE;\n"+expansion+"\nSELECT deliberately_missing_migration_function();\nCOMMIT;")
except sqlite3.OperationalError:
    db.rollback()
else:
    raise AssertionError("Injected migration failure did not abort")
assert db.execute("SELECT * FROM tenant_records ORDER BY business_id,record_type,id").fetchall()==before_records
assert db.execute("SELECT * FROM tenant_audit_events ORDER BY id").fetchall()==before_audit
assert not db.execute("SELECT name FROM sqlite_master WHERE name='tenant_records_expanded'").fetchall()
db.executescript("BEGIN IMMEDIATE;\n"+expansion+"\nCOMMIT;")
# SELECT * column ordering is explicitly preserved by the expansion schema.
assert db.execute("SELECT * FROM tenant_records ORDER BY business_id,record_type,id").fetchall()==before_records
assert db.execute("SELECT * FROM tenant_audit_events ORDER BY id").fetchall()==before_audit
for kind in ("tasks","payments","expenses","jobCosts","opportunities","suppliers","supplyOrders","crew","calendars","calendarEntries","calendarProposals","calendarPreferences","routePlans","marketingCampaigns","pins","events"):
    db.execute("INSERT INTO tenant_records(business_id,record_type,id,payload) VALUES (?,?,?,?)",("business_002",kind,"expanded_1",'{"custom":"preserved"}'))
assert db.execute("SELECT COUNT(*) FROM tenant_records").fetchone()[0]==18
assert db.execute("PRAGMA foreign_key_check").fetchall()==[]
# A member's pre-authorized financial request is denied inside SQL, not merely by JS.
db.execute("UPDATE business_memberships SET role='member' WHERE business_id='business_002'")
financial_sql=sql.replace("/* financial-guard */", "AND role IN ('owner','admin')")
financial_args=("business_002","payments","payment_new",1,'{"amount":25}',"issuer.example","user_001",0,"business_002","payments","payment_new","business_002","issuer.example","user_001",0)
assert db.execute(financial_sql,financial_args).fetchone() is None
db.execute("UPDATE business_memberships SET role='admin' WHERE business_id='business_002'")
assert db.execute(financial_sql,financial_args).fetchone()[0]==1
assert db.execute("SELECT COUNT(*) FROM tenant_audit_events").fetchone()[0]==4
print("PASS: 20-type expansion preserves rows/audits, rollback works, financial SQL permissions enforced")

# Crew management and job assignment are checked inside the write statement,
# even when the JS authorization object is stale after a role downgrade.
job_guard = re.search(r"export const JOB_ASSIGNMENT_GUARD_SQL =`(.*?)`;", source, re.S).group(1)
job_sql = sql.replace("/* financial-guard */", job_guard)
business="business_002"
def assigned_job(expected, payload):
    return db.execute(job_sql,(business,"jobs","assignment_job",expected+1,payload,"issuer.example","user_001",expected,business,"jobs","assignment_job",business,"issuer.example","user_001",payload,business,"assignment_job",expected)).fetchone()

db.execute("UPDATE business_memberships SET role='owner' WHERE business_id=?",(business,))
assert assigned_job(0,'{"title":"Panel replacement","crewId":"crew_001"}')[0]==1
before_audit=db.execute("SELECT COUNT(*) FROM tenant_audit_events").fetchone()[0]
db.execute("UPDATE business_memberships SET role='member' WHERE business_id=?",(business,))
assert assigned_job(1,'{"title":"Unapproved assignment","crewId":"crew_002"}') is None
assert assigned_job(1,'{"title":"Unapproved removal"}') is None
assert db.execute("SELECT COUNT(*) FROM tenant_audit_events").fetchone()[0]==before_audit
assert assigned_job(1,'{"title":"Permitted note edit","crewId":"crew_001"}')[0]==2
roster_sql=sql.replace("/* financial-guard */", "AND role IN ('owner','admin')")
roster_args=(business,"crew","crew_private",1,'{"role":"owner"}',"issuer.example","user_001",0,business,"crew","crew_private",business,"issuer.example","user_001",0)
assert db.execute(roster_sql,roster_args).fetchone() is None
db.execute("UPDATE business_memberships SET role='admin' WHERE business_id=?",(business,))
assert db.execute(roster_sql,roster_args).fetchone()[0]==1
assert assigned_job(2,'{"title":"Authorized reassignment","crewId":"crew_002"}')[0]==3
print("PASS: roster and assignment authority enforced atomically; member note edits preserved")

# Read-only intelligence retrieval filters tenant, exact live role and permitted
# record types in SQL before any data can be provided to an intelligence caller.
context_source=(root / 'src' / 'intelligence-context.js').read_text()
context_sql=re.search(r"export const CONTEXT_READ_SQL =`(.*?)`;",context_source,re.S).group(1).replace('/* permitted-types */','?')
args=(business,business,'issuer.example','user_001','admin','jobs')
assert len(db.execute(context_sql,args).fetchall())>0
assert all(row[0]=='jobs' for row in db.execute(context_sql,args).fetchall())
assert db.execute(context_sql,('business_001','business_001','issuer.example','user_001','admin','jobs')).fetchall()==[]
db.execute("UPDATE business_memberships SET role='member' WHERE business_id=?",(business,))
assert db.execute(context_sql,args).fetchall()==[]
assert len(db.execute(context_sql,(business,business,'issuer.example','user_001','member','jobs')).fetchall())>0
db.execute("UPDATE business_memberships SET status='suspended' WHERE business_id=?",(business,))
assert db.execute(context_sql,(business,business,'issuer.example','user_001','member','jobs')).fetchall()==[]
print('PASS: intelligence reads filter tenant, role, type and revocation inside SQL')
