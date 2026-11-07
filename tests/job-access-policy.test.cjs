const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('R01-02 disposable D1 job grants are tenant/job/actor scoped and revocable',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tf-job-grants-'));
 let dispose;
 try{
  const root=path.resolve(__dirname,'..');
  const config=path.join(tmp,'wrangler.json');
  fs.writeFileSync(config,JSON.stringify({
   name:'tf-job-grants-disposable',main:path.join(root,'src/index.js'),
   compatibility_date:'2026-10-13',
   d1_databases:[{binding:'TF_DB',database_name:'tf-job-grants-disposable',
    database_id:'00000000-0000-4000-8000-000000000097'}]
  }));
  const {getPlatformProxy}=await import('wrangler');
  const proxy=await getPlatformProxy({configPath:config,persist:{path:path.join(tmp,'state')}});
  dispose=proxy.dispose;
  const db=proxy.env.TF_DB;
  const run=(sql,params=[])=>db.prepare(sql).bind(...params).run();
  for(const file of ['0001_tenant_foundation.sql','0004_job_access_grants.sql']){
   const sql=fs.readFileSync(path.join(root,'migrations',file),'utf8')
    .replace(/^\s*--[^\n]*$/gm,'');
   for(const part of sql.split(';').map(x=>x.trim()).filter(Boolean))await run(part);
  }
  for(const id of ['business_001','business_002'])
   await run('INSERT INTO businesses(id,name) VALUES(?,?)',[id,id]);
  for(const [business,subject,role] of [
   ['business_001','owner_01','owner'],
   ['business_001','crew_01','member'],
   ['business_001','office_01','member'],
   ['business_001','viewer_01','viewer'],
   ['business_002','crew_01','member']
  ])await run('INSERT INTO business_memberships(business_id,issuer,subject,role) VALUES(?,?,?,?)',
   [business,'test-issuer',subject,role]);
  for(const [business,id] of [['business_001','job_01'],['business_001','job_02'],['business_002','job_01']])
   await run('INSERT INTO tenant_records(business_id,record_type,id,payload) VALUES(?,?,?,?)',
    [business,'jobs',id,JSON.stringify({id,businessId:business})]);
  const grant=(business,job,subject,scope)=>
   run('INSERT INTO job_access_grants(business_id,job_id,issuer,subject,scope,granted_by_issuer,granted_by_subject) VALUES(?,?,?,?,?,?,?)',
    [business,job,'test-issuer',subject,scope,'test-issuer','owner_01']);
  await grant('business_001','job_01','crew_01','crew');
  await grant('business_001','job_01','office_01','office');
  // Composite foreign keys and CHECKs reject grants to absent members,
  // missing/cross-business jobs or an invented scope.
  await assert.rejects(grant('business_001','missing_job','crew_01','crew'));
  await assert.rejects(grant('business_002','job_02','crew_01','crew'));
  await assert.rejects(grant('business_001','job_01','forged_actor','crew'));
  await assert.rejects(grant('business_001','job_01','crew_01','supervisor'));
  const {readJobAccess}=await import('../src/job-access.js');
  const principal=subject=>({verified:true,issuer:'test-issuer',subject});
  const read=(subject,job='job_01',scope='crew',business='business_001')=>
   readJobAccess({db,principal:principal(subject),businessId:business,jobId:job,scope});
  const crew=await read('crew_01');
  assert.equal(crew.accessClass,'assigned_job');
  assert.equal(crew.grantRevision,1);
  assert.equal(crew.writeAuthorized,false);
  assert.equal(crew.jobRevision,1);
  const {writeTenantRecord}=await import('../src/tenant-record-store.js');
  const crewAuth={businessId:'business_001',issuer:'test-issuer',subject:'crew_01',role:'member'};
  const submitted={revision:1,record:{id:'job_01',fieldUpdates:[]}};
  await assert.rejects(writeTenantRecord(db,crewAuth,'jobs','job_01',submitted,
   {jobAccessProof:{...crew}}),{status:403},
   'a forged serialized proof must never authorize scoped mutation');
  await assert.rejects(writeTenantRecord(db,crewAuth,'jobs','job_02',submitted,
   {jobAccessProof:crew}),{status:403},
   'a real grant cannot authorize a different job');
  await assert.rejects(writeTenantRecord(db,crewAuth,'jobs','job_01',
   {...submitted,revision:2},{jobAccessProof:crew}),{status:409},
   'a stale job revision cannot be silently rewritten');
  await assert.rejects(readJobAccess({db,principal:{verified:false,issuer:'test-issuer',subject:'crew_01'},
   businessId:'business_001',jobId:'job_01',scope:'crew'}),{status:401});
  assert.equal((await read('owner_01','job_02')).accessClass,'company_member');
  const officeProof=await read('office_01','job_01','office');
  assert.equal(officeProof.scope,'office');
  const officeAuth={businessId:'business_001',issuer:'test-issuer',subject:'office_01',role:'member'};
  await assert.rejects(writeTenantRecord(db,officeAuth,'jobs','job_01',submitted,
   {jobAccessProof:{...officeProof}}),{status:403},
   'serialized office proof cannot authorize a job mutation');
  await assert.rejects(writeTenantRecord(db,officeAuth,'jobs','job_02',submitted,
   {jobAccessProof:officeProof}),{status:403},
   'office proof is limited to its exact job');

  // TF-RM-03-E: the actual office evidence SELECT must independently gate
  // the job payload on current office scope, not on crew grant or job.crewId.
  const persisted={
   schemaVersion:1,eventId:'blocker_01',idempotencyKey:'blocker_01_once',
   kind:'job_blocker_reported',note:'Panel delivery has not arrived.',
   eventAt:'2026-11-03T08:00:00Z',actorId:'crew_01',actorIssuer:'test-issuer'
  };
  const setJob=async updates=>run(
   'UPDATE tenant_records SET payload=? WHERE business_id=? AND record_type=? AND id=?',
   [JSON.stringify({id:'job_01',businessId:'business_001',title:'Service upgrade',
    fieldUpdates:updates,privateHourlyRate:17000}), 'business_001','jobs','job_01']);
  await setJob([persisted]);
  const {reviewOfficeJobBlocker}=await import('../src/office-job-intelligence.js');
  const officeReview=(subject='office_01',options={})=>reviewOfficeJobBlocker({
   db,principal:principal(subject),businessId:'business_001',
   jobId:'job_01',eventId:'blocker_01',...options
  });
  const before=await db.prepare(
   "SELECT revision,payload FROM tenant_records WHERE business_id='business_001' AND record_type='jobs' AND id='job_01'"
  ).first();
  const review=await officeReview('office_01',{threadId:'thread_01',expectedJobRevision:1});
  assert.equal(review.source.revision,1);
  assert.equal(review.source.grantRevision,1);
  assert.equal(review.report.persistedEventPresent,true);
  assert.equal(review.report.actorAttributionVerified,false);
  assert.equal(review.report.acknowledgment,'unverified');
  assert.equal(review.memory.status,'not_saved');
  assert.equal(review.suggestedNextAction.commandId,'draft.prepare');
  assert.equal(review.suggestedNextAction.params.kind,'task');
  assert.equal(review.suggestedNextAction.status,'proposal_only');
  assert.equal(review.executionAuthority,false);
  assert.equal(review.externalEffects,false);
  assert.equal(Object.isFrozen(review),true);
  assert.doesNotMatch(JSON.stringify(review),/privateHourlyRate|17000/,
   'office advisory must not leak unrelated financial job payload');
  assert.equal((await officeReview('owner_01')).source.grantRevision,null,
   'owner can review within same tenant without an office job grant');
  await assert.rejects(officeReview('crew_01'),{status:403},
   'crew scope is NOT an office viewer grant');
  await assert.rejects(officeReview('viewer_01'),{status:403});
  await assert.rejects(officeReview('office_01',{jobId:'job_02'}),{status:403});
  await assert.rejects(officeReview('office_01',{businessId:'business_002'}),{status:403});
  await assert.rejects(officeReview('office_01',{expectedJobRevision:2}),{status:409});
  await assert.rejects(officeReview('office_01',{eventId:'not_found'}),{status:404});
  await assert.rejects(officeReview('office_01',{threadId:'invalid thread'}),{status:400});
  await setJob([persisted,{...persisted,eventId:'another_event'}]);
  await assert.rejects(officeReview('office_01'),{status:409},
   'idempotency collision cannot be explained as a verified unique report');
  await setJob([{...persisted,note:'a'.repeat(501)}]);
  await assert.rejects(officeReview('office_01'),{status:404},
   'unbounded or malformed crew payload is not a verified blocker');
  await setJob([persisted]);
  await run("UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=? AND scope='office'",
   ['business_001','job_01','office_01']);
  await assert.rejects(officeReview('office_01'),{status:403},
   'revoked office grant fails in the evidence read itself');
  await run("UPDATE job_access_grants SET status='active',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=? AND scope='office'",
   ['business_001','job_01','office_01']);
  assert.equal((await officeReview()).source.grantRevision,3);
  const after=await db.prepare(
   "SELECT revision,payload FROM tenant_records WHERE business_id='business_001' AND record_type='jobs' AND id='job_01'"
  ).first();
  assert.deepEqual(after,before,'advisory cannot mutate job or issue task');
  await assert.rejects(read('office_01','job_01','crew'),/Assigned job/);
  await assert.rejects(read('crew_01','job_02'),/Assigned job/);
  await assert.rejects(read('viewer_01'),/Assigned job/);
  await assert.rejects(read('crew_01','job_01','crew','business_002'),/Assigned job/);
  await assert.rejects(grant('business_001','job_02','crew_01','crew').then(()=>grant('business_001','job_02','crew_01','crew')));
  await run("UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=?",
   ['business_001','job_01','crew_01']);
  await assert.rejects(read('crew_01'),/Assigned job/);
  await run("UPDATE job_access_grants SET status='active',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=?",
   ['business_001','job_01','crew_01']);
  assert.equal((await read('crew_01')).grantRevision,3);
  await run("UPDATE business_memberships SET role='viewer' WHERE business_id=? AND subject=?",
   ['business_001','crew_01']);
  await assert.rejects(read('crew_01'),/Assigned job/);
  await run("UPDATE business_memberships SET role='member' WHERE business_id=? AND subject=?",
   ['business_001','crew_01']);
  await run("UPDATE tenant_records SET deleted_at=datetime('now') WHERE business_id=? AND id=? AND record_type='jobs'",
   ['business_001','job_01']);
  await assert.rejects(read('crew_01'),/Assigned job/);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM job_access_grants').first()).n,3);
  await run("UPDATE business_memberships SET status='suspended' WHERE business_id=? AND subject=?",
   ['business_001','office_01']);
  await assert.rejects(read('office_01','job_01','office'),{status:403});
  await run('DROP TABLE job_access_grants');
  await assert.rejects(read('owner_01'),{status:503},
   'missing grant schema must fail closed even for company-wide job scope');
 }finally{
  if(dispose)await dispose();
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
