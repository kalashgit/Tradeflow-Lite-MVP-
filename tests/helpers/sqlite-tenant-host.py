"""Test-only JSON/SQLite bridge; accepts trusted statements on stdin, never HTTP."""
import json, pathlib, sqlite3, sys
request=json.load(sys.stdin)
db=sqlite3.connect(request['database'])
db.row_factory=sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
if request.get('initialize'):
    root=pathlib.Path(__file__).resolve().parents[2]
    for name in ['0001_tenant_foundation.sql','0002_record_audit.sql','0003_extended_business_records.sql']:
        db.executescript((root/'migrations'/name).read_text())
    db.execute('INSERT INTO businesses(id,name) VALUES (?,?)',('business_001','Synthetic two-device contractor'))
    db.execute('INSERT INTO business_memberships(business_id,issuer,subject,role) VALUES (?,?,?,?)',('business_001',request['issuer'],request['subject'],'owner'))
    result=[]
else:
    cursor=db.execute(request['sql'],request.get('params',[]))
    result=[dict(row) for row in cursor.fetchall()] if cursor.description else []
db.commit()
print(json.dumps(result))
db.close()
