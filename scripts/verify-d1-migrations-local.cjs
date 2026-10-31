/* H04-15c: committed SQL migrations against disposable local Wrangler D1 only.
 * No account config, remote D1, Cloudflare API or production migration is used.
 * Run: node scripts/verify-d1-migrations-local.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const migrationPaths=[
 '0001_tenant_foundation.sql',
 '0002_record_audit.sql',
 '0003_extended_business_records.sql'
];
const scriptRoot=path.resolve(__dirname,'..');
const file=name=>fs.readFileSync(path.join(scriptRoot,'migrations',name),'utf8');

// The three committed migrations contain ordinary SQL and CREATE TRIGGER
// bodies. Preserve each trigger body as one statement. This is a fixture
// parser for these source-controlled files, not a general-purpose SQL runner.
function splitCommittedMigration(source){
 const cleaned=source.replace(/^\s*--[^\n]*$/gm,'');
 const triggers=[];
 const placeholders=cleaned.replace(/CREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/gi,sql=>{
  const label='__TRADEFLOW_TRIGGER_'+triggers.length+'__';
  triggers.push(sql.slice(0,-1).trim());
  return label+';';
 });
 const statements=placeholders.split(';').map(sql=>sql.trim()).filter(Boolean).map(sql=>{
  const match=/^__TRADEFLOW_TRIGGER_(\d+)__$/.exec(sql);
  return match?triggers[Number(match[1])]:sql;
 });
 assert.equal(triggers.length,source.match(/CREATE\s+TRIGGER\b/gi)?.length||0,
  'every committed trigger must be parsed as one statement');
 assert.ok(statements.length>0,'migration must have executable statements');
 return statements;
}
async function statement(db,sql,params=[]){
 return db.prepare(sql).bind(...params).run();
}
async function applySequentially(db,migration){
 const sqls=splitCommittedMigration(file(migration));
 for(const text of sqls) await statement(db,text);
 return sqls.length;
}
const sortedRows=rows=>rows.map(x=>JSON.stringify(x)).sort();
const all=async(db,sql,params=[])=>(
 await db.prepare(sql).bind(...params).all()).results;
const count=async(db,table)=>{
 const row=await db.prepare('SELECT COUNT(*) AS n FROM '+table).first();
 return row.n;
};
async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tradeflow-d1-migrations-'));
 let dispose;
 try{
  const config=path.join(tmp,'wrangler.json');
  fs.writeFileSync(config,JSON.stringify({
   name:'tradeflow-migration-disposable-test',
   compatibility_date:'2026-10-13',
   main:path.resolve(scriptRoot,'src/index.js'),
   d1_databases:[{binding:'TF_DB',database_name:'tradeflow-migration-disposable',
    database_id:'00000000-0000-4000-8000-000000000099'}]
  }));
  const {getPlatformProxy}=await import('wrangler');
  const proxy=await getPlatformProxy({configPath:config,persist:{path:path.join(tmp,'state')}});
  dispose=proxy.dispose;
  const db=proxy.env.TF_DB;
  assert.ok(db?.prepare&&db?.batch,'disposable local D1 binding required');
  const n1=await applySequentially(db,migrationPaths[0]);
  assert.ok(n1>4);
  await statement(db,'INSERT INTO businesses (id,name) VALUES (?,?)',
   ['business_001','Disposable D1 contractor']);
  await statement(db,'INSERT INTO businesses (id,name) VALUES (?,?)',
   ['business_002','Other disposable tenant']);
  await statement(db,'INSERT INTO business_memberships (business_id,issuer,subject,role) VALUES (?,?,?,?)',
   ['business_001','synthetic-issuer','synthetic-owner','owner']);
  const n2=await applySequentially(db,migrationPaths[1]);
  assert.ok(n2>=4);
  await statement(db,
   'INSERT INTO tenant_records (business_id,record_type,id,revision,payload,updated_at,updated_by_issuer,updated_by_subject) VALUES (?,?,?,?,?,?,?,?)',
   ['business_001','jobs','job_active',7,'{"title":"existing"}','2026-01-01 12:00:00','synthetic-issuer','synthetic-owner']);
  await statement(db,
   'INSERT INTO tenant_records (business_id,record_type,id,revision,payload,updated_at,deleted_at,updated_by_issuer,updated_by_subject) VALUES (?,?,?,?,?,?,?,?,?)',
   ['business_001','jobs','job_tombstone',4,'{"title":"deleted"}','2026-01-02 12:00:00','2026-01-03 12:00:00','synthetic-issuer','synthetic-owner']);
  await statement(db,
   'UPDATE tenant_records SET revision=8 WHERE business_id=? AND record_type=? AND id=?',
   ['business_001','jobs','job_active']);
  const recordQuery='SELECT * FROM tenant_records ORDER BY business_id,record_type,id';
  const auditQuery='SELECT * FROM tenant_audit_events ORDER BY id';
  const beforeRecords=await all(db,recordQuery);
  const beforeAudit=await all(db,auditQuery);
  assert.equal(beforeRecords.length,2);
  assert.equal(beforeAudit.length,3);
  const migration3=splitCommittedMigration(file(migrationPaths[2]));
  assert.ok(migration3.length>=7);
  // D1.batch() is transactional. An invalid business duplicate placed AFTER
  // schema changes must undo all earlier schema and data changes in the batch.
  const forcedFailure=[...migration3,
   "INSERT INTO businesses (id,name) VALUES ('business_001','duplicate-must-fail')"];
  await assert.rejects(db.batch(forcedFailure.map(x=>db.prepare(x))),
   'forced migration failure must reject the whole D1 batch');
  assert.deepEqual(await all(db,recordQuery),beforeRecords,
   'injected migration failure must preserve original records');
  assert.deepEqual(await all(db,auditQuery),beforeAudit,
   'injected migration failure must preserve original audit');
  const leaked=await all(db,
   "SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_records_expanded'");
  assert.equal(leaked.length,0,'temporary expanded table must roll back');
  assert.equal((await all(db,
   "SELECT name FROM sqlite_master WHERE type='trigger' AND name='tenant_record_update_audit'")).length,1,
   'old audit trigger must survive rollback');

  await db.batch(migration3.map(x=>db.prepare(x)));
  assert.deepEqual(await all(db,recordQuery),beforeRecords,
   'migration must preserve all payloads, revisions, tombstones and attribution');
  assert.deepEqual(await all(db,auditQuery),beforeAudit,
   'data-copy migration must not invent audit events');
  assert.equal((await all(db,
   "SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_records_expanded'")).length,0);
  assert.equal((await all(db,
   "SELECT name FROM sqlite_master WHERE type='index' AND name='tenant_records_updated'")).length,1);
  assert.equal((await all(db,
   "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('tenant_record_create_audit','tenant_record_update_audit')")).length,2);
  assert.equal((await all(db,'PRAGMA foreign_key_check')).length,0);

  await statement(db,
   'INSERT INTO tenant_records (business_id,record_type,id,revision,payload,updated_by_issuer,updated_by_subject) VALUES (?,?,?,?,?,?,?)',
   ['business_001','tasks','new_task',1,'{"kind":"internal"}','synthetic-issuer','synthetic-owner']);
  assert.equal(await count(db,'tenant_records'),3);
  assert.equal(await count(db,'tenant_audit_events'),4,
   'attributed create must produce exactly one audit event');
  await statement(db,
   'UPDATE tenant_records SET revision=revision+1 WHERE business_id=? AND record_type=? AND id=?',
   ['business_001','tasks','new_task']);
  assert.equal(await count(db,'tenant_audit_events'),5,
   'attributed update must produce exactly one audit event');
  const task=(await all(db,
   'SELECT revision,payload FROM tenant_records WHERE business_id=? AND record_type=? AND id=?',
   ['business_001','tasks','new_task']))[0];
  assert.equal(task.revision,2);
  assert.equal(task.payload,'{"kind":"internal"}');
  await assert.rejects(statement(db,
   'INSERT INTO tenant_records (business_id,record_type,id,payload) VALUES (?,?,?,?)',
   ['business_001','not-allowed','bad','{}']));
  await assert.rejects(statement(db,
   'INSERT INTO tenant_records (business_id,record_type,id,payload) VALUES (?,?,?,?)',
   ['not-existing-tenant','jobs','bad','{}']));
  assert.equal(await count(db,'tenant_records'),3,
   'invalid record/foreign key must not write');
  console.log('H04-15c PASS: committed migrations 0001,0002,0003 on disposable local D1;');
  console.log('  injected atomic rollback, row/tombstone/audit preservation,');
  console.log('  expanded type, constraint, foreign key, index and trigger checks passed.');
  console.log('  No live D1 migration or customer acceptance claimed.');
 }finally{
  if(dispose)await dispose();
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error('H04-15c local D1 migrations FAILED:',error);process.exitCode=1;});
