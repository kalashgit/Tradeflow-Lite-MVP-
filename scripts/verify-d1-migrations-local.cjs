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
 '0003_extended_business_records.sql',
 '0004_job_access_grants.sql'
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
  // R01-02 development-only migration is applied AFTER the full 0001–0003
  // chain. DDL rollback and referential integrity are tested in disposable D1.
  const migration4=splitCommittedMigration(file(migrationPaths[3]));
  assert.ok(migration4.length>=2,'grant table and principal index exist');
  await assert.rejects(db.batch([...migration4,
   "INSERT INTO businesses(id,name) VALUES ('business_001','duplicate-to-rollback-grants')"
  ].map(x=>db.prepare(x))),'forced schema migration failure must roll back grant table');
  assert.equal((await all(db,
   "SELECT name FROM sqlite_master WHERE type='table' AND name='job_access_grants'")).length,0);
  await db.batch(migration4.map(x=>db.prepare(x)));
  assert.equal((await all(db,
   "SELECT name FROM sqlite_master WHERE type='table' AND name='job_access_grants'")).length,1);
  const addGrant=(job,member,scope)=>statement(db,
   'INSERT INTO job_access_grants(business_id,job_id,issuer,subject,scope,granted_by_issuer,granted_by_subject) VALUES (?,?,?,?,?,?,?)',
   ['business_001',job,'synthetic-issuer',member,scope,'synthetic-issuer','synthetic-owner']);
  await addGrant('job_active','synthetic-owner','office');
  await assert.rejects(addGrant('missing-job','synthetic-owner','office'),
   'cannot authorize a nonexistent job');
  await assert.rejects(addGrant('job_active','missing-member','crew'),
   'cannot authorize an unknown membership');
  assert.equal((await all(db,'PRAGMA foreign_key_check')).length,0,
   'job grants must preserve foreign key integrity');
  assert.equal((await count(db,'job_access_grants')),1);
  await statement(db,
   "UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=?",
   ['business_001','job_active','synthetic-owner']);
  const grants=await all(db,
   'SELECT status,grant_revision FROM job_access_grants WHERE business_id=? AND job_id=?',
   ['business_001','job_active']);
  assert.deepEqual(grants,[{status:'revoked',grant_revision:2}]);
  // R01-02D: exercise the existing job writer with a server-minted grant,
  // then revoke the grant at the mutation boundary to prove atomic denial.
  await statement(db,
   'INSERT INTO business_memberships(business_id,issuer,subject,role) VALUES (?,?,?,?)',
   ['business_001','synthetic-issuer','synthetic-crew','member']);
  await addGrant('job_active','synthetic-crew','crew');
  const {createLocalCrewReport,submitGrantedCrewBlocker}=await import('../src/role-exchange.js');
  const identity={verified:true,issuer:'synthetic-issuer',subject:'synthetic-crew'};
  const makeEvent=(revision,eventId)=>createLocalCrewReport({
   businessId:'business_001',actorId:'synthetic-crew',
   jobId:'job_active',baseRevision:revision,note:'Missing panel breaker',
   eventId,idempotencyKey:eventId+'_once',at:'2026-11-03T08:00:00Z'
  });
  const submit=(targetDb,event)=>submitGrantedCrewBlocker({
   db:targetDb,principal:identity,businessId:'business_001',jobId:'job_active',event
  });
  const saved=await submit(db,makeEvent(8,'blocker_first'));
  assert.equal(saved.status,'readback_verified');
  assert.equal(saved.assignmentAtCommitVerified,true,
   'new job grant must be enforced atomically by the existing CAS');
  assert.equal(saved.acknowledged,false);
  assert.equal(saved.observedServerRevision,9);
  const written=await all(db,
   "SELECT payload,revision,updated_by_subject FROM tenant_records WHERE business_id=? AND record_type='jobs' AND id=?",
   ['business_001','job_active']);
  assert.equal(written[0].revision,9);
  assert.equal(written[0].updated_by_subject,'synthetic-crew');
  assert.equal(JSON.parse(written[0].payload).fieldUpdates[0].eventId,'blocker_first');
  // TF-RM-03-E: end-to-end internal D1 path, actual committed crew report
  // -> independently granted office principal -> read-only Intelligence advice.
  await statement(db,
   'INSERT INTO business_memberships(business_id,issuer,subject,role) VALUES (?,?,?,?)',
   ['business_001','synthetic-issuer','synthetic-office','member']);
  const officePrincipal={verified:true,issuer:'synthetic-issuer',subject:'synthetic-office'};
  const {reviewOfficeJobBlocker}=await import('../src/office-job-intelligence.js');
  const reviewOffice=(targetDb=db)=>reviewOfficeJobBlocker({
   db:targetDb,principal:officePrincipal,businessId:'business_001',
   jobId:'job_active',eventId:'blocker_first',expectedJobRevision:9
  });
  await assert.rejects(reviewOffice(),{status:403},
   'ungranted office member must not see a crew report');
  await addGrant('job_active','synthetic-office','office');
  const officeCase=await reviewOffice();
  assert.equal(officeCase.source.revision,9);
  assert.equal(officeCase.source.grantRevision,1);
  assert.equal(officeCase.report.reportedNote,'Missing panel breaker');
  assert.equal(officeCase.report.persistedEventPresent,true);
  assert.equal(officeCase.report.actorAttributionVerified,false);
  assert.equal(officeCase.memory.status,'not_saved');
  assert.equal(officeCase.suggestedNextAction.commandId,'draft.prepare');
  assert.equal(officeCase.suggestedNextAction.status,'proposal_only');
  assert.equal(officeCase.executionAuthority,false);
  assert.equal(officeCase.externalEffects,false);
  // Deliberately revoke between authorization preflight and the guarded
  // evidence SELECT: no stale grant proof can leak the job payload.
  let interceptedOfficeRead=0;
  const raceOfficeDb={prepare(sql){
   const prepared=db.prepare(sql);
   if(!sql.includes('t.payload AS job_payload'))return prepared;
   return {bind(...params){
    const bound=prepared.bind(...params);
    return {async first(){
     interceptedOfficeRead++;
     await statement(db,
      "UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=? AND scope='office'",
      ['business_001','job_active','synthetic-office']);
     return bound.first();
    }};
   }};
  }};
  await assert.rejects(reviewOffice(raceOfficeDb),{status:403},
   'office grant revoked at evidence read must prevent leakage');
  assert.equal(interceptedOfficeRead,1);
  await assert.rejects(reviewOffice(),{status:403});
  const ownerCase=await reviewOfficeJobBlocker({
   db,principal:{verified:true,issuer:'synthetic-issuer',subject:'synthetic-owner'},
   businessId:'business_001',jobId:'job_active',eventId:'blocker_first'
  });
  assert.equal(ownerCase.source.grantRevision,null);
  assert.equal((await all(db,
   "SELECT revision FROM tenant_records WHERE business_id=? AND record_type='jobs' AND id=?",
   ['business_001','job_active']))[0].revision,9,
   'office Intelligence must neither mutate the job nor create a task');
  console.log('TF-RM-03-E PASS: real D1 crew write -> independent office grant ->');
  console.log('  read-only source-linked Intelligence; revocation at evidence read denied.');
  // Intercept only the final CAS in this disposable test. The grant is
  // revoked AFTER trusted preflight and before mutation executes.
  let intercepted=0;
  const racedDb={prepare(sql){
   const prepared=db.prepare(sql);
   return {bind(...params){
    const bound=prepared.bind(...params);
    if(!sql.startsWith('INSERT INTO tenant_records'))return bound;
    return {async first(){
     intercepted++;
     await statement(db,
      "UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=?",
      ['business_001','job_active','synthetic-crew']);
     return bound.first();
    }};
   }};
  }};
  await assert.rejects(submit(racedDb,makeEvent(9,'blocker_raced')),{status:409},
   'revoked grant at SQL commit denies write despite earlier valid preflight');
  assert.equal(intercepted,1);
  assert.equal((await all(db,
   "SELECT revision FROM tenant_records WHERE business_id=? AND record_type='jobs' AND id=?",
   ['business_001','job_active']))[0].revision,9);
  await assert.rejects(submit(db,makeEvent(9,'blocker_revoked')),{status:403});
  console.log('R01-02D PASS: assigned crew blocker uses existing atomic CAS with');
  console.log('  grant revision, membership, job revision and revocation-at-commit.');
  console.log('R01-02 PASS: source migration 0004 after 0001–0003; atomic rollback,');
  console.log('  FK denials, current revision/revocation and integrity on disposable D1.');
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
