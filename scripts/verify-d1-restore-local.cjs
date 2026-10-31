/* H04-15d. Disposable LOCAL D1 logical recovery drill. NOT a production
 * backup, export endpoint, restore tool, or replacement for D1 PITR.
 * No Wrangler account config, credentials, remote database or egress.
 */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const MIGRATIONS=['0001_tenant_foundation.sql','0002_record_audit.sql','0003_extended_business_records.sql'];
const TABLES=Object.freeze({
 businesses:['id','name','created_at'],
 business_memberships:['business_id','issuer','subject','role','status','created_at'],
 tenant_records:['business_id','record_type','id','revision','payload','updated_at','deleted_at','updated_by_issuer','updated_by_subject'],
 tenant_audit_events:['id','business_id','issuer','subject','action','record_type','record_id','created_at']
});
const readMigration=name=>fs.readFileSync(path.join(ROOT,'migrations',name),'utf8');
function splitCommittedSql(sql){
 const clean=sql.replace(/^\s*--[^\n]*$/gm,'');
 const triggers=[];
 const replaced=clean.replace(/CREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/gi,s=>{
  const i=triggers.push(s.slice(0,-1).trim())-1;
  return '__TRIGGER_'+i+'__;';
 });
 const statements=replaced.split(';').map(s=>s.trim()).filter(Boolean).map(s=>{
  const m=/^__TRIGGER_(\d+)__$/.exec(s);
  return m?triggers[Number(m[1])]:s;
 });
 assert.equal(triggers.length,(sql.match(/CREATE\s+TRIGGER\b/gi)||[]).length);
 return statements;
}
const all=async(db,sql,args=[])=>(
 await db.prepare(sql).bind(...args).all()).results;
const run=async(db,sql,args=[])=>db.prepare(sql).bind(...args).run();
async function migrate(db){
 for(const name of MIGRATIONS){
  const stmts=splitCommittedSql(readMigration(name));
  if(name.startsWith('0003'))await db.batch(stmts.map(sql=>db.prepare(sql)));
  else for(const sql of stmts)await run(db,sql);
 }
}
const snapshotSql=table=>'SELECT * FROM '+table+' ORDER BY '+TABLES[table].map(c=>c).join(',');
async function capture(db){
 const data={format:'tradeflow.synthetic.logical-recovery.v1',schema:MIGRATIONS,
  tables:{}};
 for(const name of Object.keys(TABLES))data.tables[name]=await all(db,snapshotSql(name));
 return {data,digest:crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')};
}
function validate(backup){
 const expected=crypto.createHash('sha256').update(JSON.stringify(backup.data)).digest('hex');
 if(backup.digest!==expected)throw Error('Synthetic backup digest mismatch');
 if(backup.data?.format!=='tradeflow.synthetic.logical-recovery.v1'||
    JSON.stringify(backup.data.schema)!==JSON.stringify(MIGRATIONS)||
    Object.keys(backup.data.tables||{}).sort().join('|')!==Object.keys(TABLES).sort().join('|'))
  throw Error('Unexpected synthetic backup schema');
 for(const [table,cols] of Object.entries(TABLES)){
  const rows=backup.data.tables[table];
  if(!Array.isArray(rows)||rows.length>250)throw Error('Invalid synthetic table row count');
  for(const row of rows){
   if(!row||Object.keys(row).sort().join('|')!==[...cols].sort().join('|'))
    throw Error('Invalid synthetic row shape');
  }
 }
}
function prepareRestore(db,backup,injectFailure=false){
 validate(backup); // Reject corruption before preparing ANY writes.
 const statements=[
  db.prepare('DROP TRIGGER IF EXISTS tenant_record_create_audit'),
  db.prepare('DROP TRIGGER IF EXISTS tenant_record_update_audit')
 ];
 for(const [table,cols] of Object.entries(TABLES)){
  const insert='INSERT INTO '+table+' ('+cols.join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')';
  for(const row of backup.data.tables[table])
   statements.push(db.prepare(insert).bind(...cols.map(col=>row[col])));
 }
 const triggers=splitCommittedSql(readMigration(MIGRATIONS[2]))
  .filter(sql=>/^CREATE\s+TRIGGER\b/i.test(sql));
 assert.equal(triggers.length,2);
 for(const sql of triggers)statements.push(db.prepare(sql));
 if(injectFailure)
  statements.push(db.prepare("INSERT INTO businesses(id,name) VALUES ('business_001','duplicate-for-rollback')"));
 return statements;
}
async function seed(db){
 for(const [id,name] of [['business_001','Synthetic electrician'],['business_002','Synthetic neighbor']])
  await run(db,'INSERT INTO businesses(id,name) VALUES (?,?)',[id,name]);
 for(const id of ['business_001','business_002'])
  await run(db,'INSERT INTO business_memberships(business_id,issuer,subject,role,status) VALUES (?,?,?,?,?)',
   [id,'synthetic-issuer','synthetic-owner','owner','active']);
 for(const [business,id,type,revision,deleted] of [
  ['business_001','job_001','jobs',7,null],
  ['business_001','job_deleted','jobs',4,'2026-01-03 12:00:00'],
  ['business_001','task_001','tasks',3,null],
  ['business_002','job_001','jobs',1,null]]){
  await run(db,'INSERT INTO tenant_records (business_id,record_type,id,revision,payload,updated_at,deleted_at,updated_by_issuer,updated_by_subject) VALUES (?,?,?,?,?,?,?,?,?)',
   [business,type,id,revision,JSON.stringify({id,businessId:business,title:'Synthetic'}),'2026-01-02 12:00:00',deleted,'synthetic-issuer','synthetic-owner']);
 }
 await run(db,'UPDATE tenant_records SET revision=8 WHERE business_id=? AND id=?',
  ['business_001','job_001']);
}
async function compareData(db,backup){
 for(const name of Object.keys(TABLES)){
  const expected=backup.data.tables[name];
  const actual=await all(db,snapshotSql(name));
  assert.deepEqual(actual,expected,'restored table must match exactly: '+name);
 }
}
async function main(){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tf-local-d1-recovery-'));
 let dispose;
 try{
  const config=path.join(temporary,'wrangler.json');
  fs.writeFileSync(config,JSON.stringify({
   name:'tf-disposable-recovery-fixture',main:path.join(ROOT,'src/index.js'),
   compatibility_date:'2026-10-13',
   d1_databases:[
    {binding:'SOURCE',database_name:'synthetic-origin',database_id:'00000000-0000-4000-8000-000000000091'},
    {binding:'TARGET',database_name:'synthetic-restore',database_id:'00000000-0000-4000-8000-000000000092'}]
  }));
  const {getPlatformProxy}=await import('wrangler');
  const proxy=await getPlatformProxy({configPath:config,persist:{path:path.join(temporary,'state')}});
  dispose=proxy.dispose;
  const {SOURCE:source,TARGET:target}=proxy.env;
  assert.ok(source?.batch&&target?.batch,'Two disposable D1 bindings required');
  await migrate(source);await migrate(target);
  await seed(source);
  const backup=await capture(source);
  assert.equal(backup.data.tables.tenant_records.length,4);
  assert.equal(backup.data.tables.tenant_audit_events.length,5);
  const corrupt=structuredClone(backup);
  corrupt.data.tables.tenant_records[0].payload='{"tampered":true}';
  assert.throws(()=>prepareRestore(target,corrupt),/digest mismatch/);
  assert.equal((await all(target,'SELECT * FROM businesses')).length,0);
  // A failure AFTER trigger removal and all data insertions must roll back
  // together. The test target remains clean and old triggers must survive.
  await assert.rejects(target.batch(prepareRestore(target,backup,true)),
   'injected duplicate must abort the entire restore');
  for(const name of Object.keys(TABLES))
   assert.equal((await all(target,'SELECT * FROM '+name)).length,0,
    'failed restore must leave target empty: '+name);
  assert.equal((await all(target,
   "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'tenant_record_%_audit'")).length,2);
  await target.batch(prepareRestore(target,backup));
  await compareData(target,backup);
  assert.equal((await all(target,'PRAGMA foreign_key_check')).length,0);
  assert.equal((await all(target,
   "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'tenant_record_%_audit'")).length,2);
  // Newly restored triggers must fire exactly once for each attributed write.
  const before=(await all(target,'SELECT * FROM tenant_audit_events')).length;
  await run(target,'INSERT INTO tenant_records(business_id,record_type,id,payload,updated_by_issuer,updated_by_subject) VALUES (?,?,?,?,?,?)',
   ['business_001','tasks','restored_task','{"state":"new"}','synthetic-issuer','synthetic-owner']);
  await run(target,'UPDATE tenant_records SET revision=revision+1 WHERE business_id=? AND id=?',
   ['business_001','restored_task']);
  assert.equal((await all(target,'SELECT * FROM tenant_audit_events')).length,before+2);
  await compareData(source,backup); // No change to source.
  console.log('H04-15d PASS: synthetic logical digest, corruption denial, atomic failed restore,');
  console.log('  exact cross-tenant rows/tombstones/revisions/audit restore, FK and reinstalled triggers.');
  console.log('  No remote backup, point-in-time restore, or production readiness claimed.');
 }finally{
  if(dispose)await dispose();
  fs.rmSync(temporary,{recursive:true,force:true});
 }
}
main().catch(err=>{console.error('H04-15d disposable recovery FAILED:',err);process.exitCode=1;});
