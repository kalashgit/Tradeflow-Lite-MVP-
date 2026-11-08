'use strict';
/* TF-KNOW-P01E: real disposable Wrangler D1 authorization + evidence tests.
 * No remote accounts, production data, deployment, browser microphone or AI.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const issuer='test-issuer',businessId='business_123',jobId='job_01';
const principal=subject=>({verified:true,issuer,subject});
function split(source){
 const stripped=source.replace(/^\s*--[^\n]*$/gm,'');
 const triggers=[];
 const tagged=stripped.replace(/CREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/gi,sql=>{
  const id='__SCOPED_TRIGGER_'+triggers.length+'__';
  triggers.push(sql.slice(0,-1).trim());
  return id+';';
 });
 return tagged.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
  const match=/^__SCOPED_TRIGGER_(\d+)__$/.exec(x);
  return match?triggers[Number(match[1])]:x;
 });
}
test('disposable D1: current job grants protect role-specific Intelligence evidence and content',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tf-know-member-evidence-'));
 let dispose;
 try{
  const config=path.join(tmp,'wrangler.json');
  fs.writeFileSync(config,JSON.stringify({
   name:'tf-know-member-evidence-test',main:path.join(root,'src/index.js'),
   compatibility_date:'2026-10-13',
   d1_databases:[{binding:'TF_DB',database_name:'tf-know-member-evidence',
    database_id:'00000000-0000-4000-8000-000000000091'}]
  }));
  const {getPlatformProxy}=await import('wrangler');
  const proxy=await getPlatformProxy({configPath:config,persist:{path:path.join(tmp,'state')}});
  dispose=proxy.dispose;
  const db=proxy.env.TF_DB;
  const exec=(sql,args=[])=>db.prepare(sql).bind(...args).run();
  for(const migration of [
   '0001_tenant_foundation.sql','0002_record_audit.sql',
   '0003_extended_business_records.sql','0004_job_access_grants.sql'
  ]){
   const sql=fs.readFileSync(path.join(root,'migrations',migration),'utf8');
   for(const statement of split(sql))await exec(statement);
  }
  await exec('INSERT INTO businesses(id,name) VALUES (?,?)',
   [businessId,'Synthetic electrician']);
  await exec('INSERT INTO businesses(id,name) VALUES (?,?)',
   ['business_999','Foreign company']);
  for(const [tenant,subject,role] of [
   [businessId,'owner_01','owner'],[businessId,'crew_01','member'],
   [businessId,'crew_02','member'],[businessId,'office_01','member'],
   [businessId,'viewer_01','viewer'],['business_999','crew_01','member']
  ])await exec(
   'INSERT INTO business_memberships(business_id,issuer,subject,role) VALUES (?,?,?,?)',
   [tenant,issuer,subject,role]);
  const insert=async(tenant,type,id,record)=>exec(
   'INSERT INTO tenant_records(business_id,record_type,id,payload) VALUES (?,?,?,?)',
   [tenant,type,id,JSON.stringify(record)]);
  const job={id:jobId,businessId,title:'Electrical service',
   status:'In progress',privateHourlyRate:200,customerId:'customer_private'};
  await insert(businessId,'jobs',jobId,job);
  await insert(businessId,'jobs','job_02',{...job,id:'job_02'});
  await insert(businessId,'tasks','task_01',{id:'task_01',businessId,
   jobId,title:'Request missing panels',status:'open'});
  await insert(businessId,'tasks','task_02',{id:'task_02',businessId,
   jobId:'job_02',title:'Unrelated confidential job',status:'open'});
  await insert('business_999','jobs',jobId,{...job,businessId:'business_999'});
  const grant=async(subject,scope)=>exec(
   'INSERT INTO job_access_grants (business_id,job_id,issuer,subject,scope,granted_by_issuer,granted_by_subject) VALUES (?,?,?,?,?,?,?)',
   [businessId,jobId,issuer,subject,scope,issuer,'owner_01']);
  await grant('crew_01','crew');
  await grant('office_01','office');

  const {readJobScopedIntelligenceContext,SCOPED_JOB_INTELLIGENCE_SQL}=
   await import('../src/job-scoped-intelligence-context.js');
  const {createIntelligenceCase}=await import('../public/intelligence-case.js');
  const {captureCloudCaseContentBinding,inspectCurrentCloudCase}=
   await import('../src/intelligence-case-refresh.js');
  const {validateEvidence}=await import('../public/intelligence-evidence.js');
  assert.match(SCOPED_JOB_INTELLIGENCE_SQL,/g\.scope=\?/);
  assert.match(SCOPED_JOB_INTELLIGENCE_SQL,/g\.status='active'/);
  assert.match(SCOPED_JOB_INTELLIGENCE_SQL,/m\.status='active'/);
  const read=(subject='crew_01',grantScope='crew',tenant=businessId,job=jobId)=>(
   readJobScopedIntelligenceContext({db,principal:principal(subject),
    businessId:tenant,jobId:job,grantScope})
  );
  const source=await read();
  assert.equal(source.kind,'tradeflow.intelligence.context.v1');
  assert.equal(source.permission.grantScope,'crew');
  assert.equal(source.permission.grantRevision,1);
  assert.deepEqual(source.records.map(x=>x.type+':'+x.id),['jobs:job_01','tasks:task_01']);
  assert.ok(source.records.every(x=>x.revision===1&&x.provenance==='tenant_record'));
  assert.equal(source.records[0].record.privateHourlyRate,undefined);
  assert.equal(source.records.some(x=>x.id==='task_02'),false);
  assert.equal(source.executionAuthority,false);
  assert.equal(source.providerSettlementVerified,false);
  assert.ok(Object.isFrozen(source.records));
  const crewScope={mode:'cloud',businessId,role:'member',
   identity:{issuer,subject:'crew_01'},jobId,jobAccessScope:'crew',today:'2026-11-04'};
  await validateEvidence(source,crewScope);
  assert.equal((await read('office_01','office')).permission.grantScope,'office');
  for(const [subject,scope,tenant,job] of [
   ['crew_01','office',businessId,jobId],
   ['office_01','crew',businessId,jobId],
   ['crew_02','crew',businessId,jobId],
   ['viewer_01','crew',businessId,jobId],
   ['crew_01','crew',businessId,'job_02'],
   ['crew_01','crew','business_999',jobId]
  ]){
   await assert.rejects(read(subject,scope,tenant,job));
  }

  const decision={
   kind:'tradeflow.decision.v1',binding:'a'.repeat(64),
   status:'ready_for_review',evidenceMode:'authenticated_cloud_read',
   scope:crewScope,
   workflow:{records:source.records.map(r=>({
    type:r.type,id:r.id,revision:r.revision,contentHash:null,provenance:r.provenance
   }))},observations:[],proposals:[],unknowns:[]
  };
  const at='2026-11-04T08:01:00.000Z';
  const caseFile=createIntelligenceCase({
   scope:crewScope,decision,threadId:'thread_01',asOf:'2026-11-04T08:00:00.000Z'
  });
  const args={db,principal:principal('crew_01'),scope:crewScope,
   caseFile,decision,threadId:'thread_01',asOf:at};
  const captured=await captureCloudCaseContentBinding(args);
  assert.equal(captured.status,'captured_current_projection');
  assert.equal(captured.binding.jobAccessScope,'crew');
  assert.equal((await inspectCurrentCloudCase({
   ...args,contentBinding:captured.binding
  })).status,'current_projected_content_verified');

  // An inserted task changes the scoped source set without changing job
  // revision. This invalidates the previous case, even if the role remains.
  await insert(businessId,'tasks','task_03',{id:'task_03',businessId,jobId,
   title:'New task',status:'open'});
  assert.equal((await inspectCurrentCloudCase({...args,contentBinding:captured.binding}))
   .status,'stale_evidence');
  await exec("UPDATE tenant_records SET deleted_at=datetime('now') WHERE business_id=? AND record_type='tasks' AND id='task_03'",
   [businessId]);
  assert.equal((await inspectCurrentCloudCase({...args,contentBinding:captured.binding}))
   .status,'current_projected_content_verified');

  // Revoke an active grant after a case was captured, without touching the
  // job revision. The role exchange and content binding must both fail.
  await exec("UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND issuer=? AND subject=? AND scope='crew'",
   [businessId,jobId,issuer,'crew_01']);
  await assert.rejects(read(),{status:403});
  assert.equal((await inspectCurrentCloudCase({...args,contentBinding:captured.binding}))
   .status,'access_or_evidence_unverified');
  await exec("UPDATE job_access_grants SET status='active',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND issuer=? AND subject=? AND scope='crew'",
   [businessId,jobId,issuer,'crew_01']);
  assert.equal((await read()).permission.grantRevision,3);
  assert.equal((await inspectCurrentCloudCase({...args,contentBinding:captured.binding}))
   .status,'current_projected_content_verified');

  // Same-revision change in an allowed field is detected by content binding.
  const old=await db.prepare(
   "SELECT payload FROM tenant_records WHERE business_id=? AND record_type='tasks' AND id='task_01'"
  ).bind(businessId).first();
  await exec(
   "UPDATE tenant_records SET payload=? WHERE business_id=? AND record_type='tasks' AND id='task_01'",
   [JSON.stringify({...JSON.parse(old.payload),status:'done'}),businessId]);
  assert.equal((await inspectCurrentCloudCase({...args,contentBinding:captured.binding}))
   .status,'projected_source_content_changed');

  // Changed membership and job deletion are checked inside the same SQL read.
  await exec("UPDATE business_memberships SET status='suspended' WHERE business_id=? AND issuer=? AND subject=?",
   [businessId,issuer,'crew_01']);
  await assert.rejects(read(),{status:403});
  await exec("UPDATE business_memberships SET status='active' WHERE business_id=? AND issuer=? AND subject=?",
   [businessId,issuer,'crew_01']);
  await exec("UPDATE tenant_records SET deleted_at=datetime('now') WHERE business_id=? AND record_type='jobs' AND id=?",
   [businessId,jobId]);
  await assert.rejects(read(),{status:403});
 }finally{
  if(dispose)await dispose();
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
