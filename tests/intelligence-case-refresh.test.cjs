'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let createIntelligenceCase,inspectCurrentCloudCase;
const businessId='business_001',issuer='issuer.example',subject='owner_01';
const principal=()=>({verified:true,issuer,subject});
const scope=()=>({mode:'cloud',businessId,role:'owner',identity:{issuer,subject},
 jobId:'job_01',today:'2026-11-04'});
const row=(type,id,revision=2)=>({
 record_type:type,id,revision,updated_at:'2026-11-04 08:00:00',
 payload:JSON.stringify({id,businessId,title:type==='jobs'?'Service upgrade':undefined,
  ...type==='jobCosts'?{jobId:'job_01',category:'Labor',type:'actual',laborHours:24}:{}})
});
const source=(type,id,revision=2)=>({
 type,id,revision,contentHash:null,provenance:'tenant_record'
});
const decision=()=>({
 kind:'tradeflow.decision.v1',binding:'a'.repeat(64),
 status:'ready_for_review',evidenceMode:'authenticated_cloud_read',
 workflow:{records:[source('jobCosts','cost_01'),source('jobs','job_01')]},
 observations:[],proposals:[],unknowns:[]
});
const asOf='2026-11-04T08:15:00.000Z';
function fixture(){
 const f={role:'owner',active:true,rows:[row('jobs','job_01'),row('jobCosts','cost_01')],
  queries:0};
 const db={prepare(sql){
  assert.ok(sql.startsWith('SELECT'));
  return {bind(...args){return {
   async first(){
    if(!sql.includes('business_memberships'))throw Error('Unexpected first read');
    assert.deepEqual(args,[businessId,issuer,subject,'active']);
    return f.active?{role:f.role}:null;
   },
   async all(){
    f.queries++;
    assert.match(sql,/status='active' AND role=\?/);
    assert.equal(args[0],businessId);
    assert.equal(args[1],businessId);
    return {results:structuredClone(f.rows)};
   }
  }}};
 }};
 return {db,f};
}
before(async()=>{
 ({createIntelligenceCase}=await import('../public/intelligence-case.js'));
 ({inspectCurrentCloudCase}=await import('../src/intelligence-case-refresh.js'));
});
function inputs(){
 const s=scope(),d=decision(),caseFile=createIntelligenceCase({
  decision:d,scope:s,threadId:'thread_01',asOf
 });
 const {db,f}=fixture();
 const args={db,principal:principal(),caseFile,decision:d,
  scope:s,threadId:'thread_01',asOf:'2026-11-04T08:16:00.000Z'};
 return {args,f};
}
test('cloud case rechecks current authenticated records and returns revision-only evidence',async()=>{
 const {args,f}=inputs();
 const result=await inspectCurrentCloudCase(args);
 assert.equal(result.status,'current_revision_verified');
 assert.equal(result.sourceCount,2);
 assert.equal(result.sourceContentVerified,false);
 assert.equal(result.commandExecuted,false);
 assert.equal(result.executionAuthority,false);
 assert.equal(result.sourceRevisions.find(x=>x.type==='jobs').revision,2);
 assert.equal(f.queries,1);
 assert.ok(Object.isFrozen(result.sourceRevisions));
});
test('revisions, deletion and newly added records invalidate old case',async()=>{
 for(const rows of [
  [row('jobs','job_01',3),row('jobCosts','cost_01')],
  [row('jobCosts','cost_01')],
  [row('jobs','job_01'),row('jobCosts','cost_01'),row('tasks','task_01')]
 ]){
  const {args,f}=inputs();f.rows=rows;
  const result=await inspectCurrentCloudCase(args);
  assert.notEqual(result.status,'current_revision_verified');
  assert.equal(result.executionAuthority,false);
 }
});
test('role revoke or downgrade fails without promoting stale cloud case',async()=>{
 const revoked=inputs();revoked.f.active=false;
 assert.equal((await inspectCurrentCloudCase(revoked.args)).status,'access_or_evidence_unverified');
 const changed=inputs();changed.f.role='member';
 assert.equal((await inspectCurrentCloudCase(changed.args)).status,'access_or_evidence_unverified');
 const forged=inputs();forged.args.principal={...principal(),verified:false};
 assert.equal((await inspectCurrentCloudCase(forged.args)).status,'access_unverified');
 assert.equal(forged.f.queries,0);
});
test('wrong business, identity, job and thread never query tenant records',async()=>{
 for(const patch of [
  {scope:{...scope(),businessId:'business_999'}},
  {scope:{...scope(),identity:{issuer,subject:'other_01'}}},
  {scope:{...scope(),jobId:'job_02'}},
  {threadId:'other_thread'}
 ]){
  const {args,f}=inputs();
  const result=await inspectCurrentCloudCase({...args,...patch});
  assert.notEqual(result.status,'current_revision_verified');
  assert.equal(f.queries,0);
 }
});
test('case expiry, changed binding, malformed input and absent SQL fail closed',async()=>{
 const expired=inputs();expired.args.asOf='2026-11-04T08:25:00.000Z';
 assert.equal((await inspectCurrentCloudCase(expired.args)).status,'expired');
 assert.equal(expired.f.queries,0);
 const changed=inputs();changed.args.decision={...changed.args.decision,binding:'b'.repeat(64)};
 assert.equal((await inspectCurrentCloudCase(changed.args)).status,'stale_evidence');
 assert.equal(changed.f.queries,0);
 const broken=inputs();broken.args.db={prepare(){throw Error('D1 unavailable')}};
 assert.equal((await inspectCurrentCloudCase(broken.args)).status,'access_or_evidence_unverified');
 assert.equal((await inspectCurrentCloudCase({...inputs().args,scope:{mode:'local'}})).status,
  'invalid_case_or_scope');
});
