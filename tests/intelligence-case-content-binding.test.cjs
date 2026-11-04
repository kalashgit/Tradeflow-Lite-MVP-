'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');

let createIntelligenceCase,inspectCurrentCloudCase,captureCloudCaseContentBinding;
const businessId='business_001',issuer='issuer.example',subject='owner_01';
const actor=()=>({verified:true,issuer,subject});
const baseScope=()=>({mode:'cloud',businessId,role:'owner',
 identity:{issuer,subject},jobId:'job_01',today:'2026-11-04'});
const at='2026-11-04T08:00:00.000Z',now='2026-11-04T08:01:00.000Z';
const record=()=>({id:'job_01',businessId,title:'Service upgrade',
 status:'In progress',privateHourlyRate:200});
const row=()=>({record_type:'jobs',id:'job_01',revision:2,
 updated_at:'2026-11-04 08:00:00',payload:JSON.stringify(record())});
const decision=()=>({
 kind:'tradeflow.decision.v1',binding:'a'.repeat(64),status:'ready_for_review',
 evidenceMode:'authenticated_cloud_read',workflow:{records:[{
  type:'jobs',id:'job_01',revision:2,contentHash:null,provenance:'tenant_record'
 }]},observations:[],proposals:[],unknowns:[]
});

before(async()=>{
 ({createIntelligenceCase}=await import('../public/intelligence-case.js'));
 ({captureCloudCaseContentBinding,inspectCurrentCloudCase}=
  await import('../src/intelligence-case-refresh.js'));
});
function fixture({role='owner'}={}){
 const f={role,active:true,rows:[row()],reads:0,writes:0};
 const db={prepare(sql){
  assert.match(sql,/^SELECT/,'only read statements allowed');
  return {bind(...params){return {
   async first(){
    assert.deepEqual(params,[businessId,issuer,subject,'active']);
    return f.active?{role:f.role}:null;
   },
   async all(){
    f.reads++;
    assert.match(sql,/business_memberships/);
    assert.deepEqual(params.slice(0,5),[businessId,businessId,issuer,subject,f.role]);
    return {results:structuredClone(f.rows)};
   }
  }}};
 }};
 const scope=baseScope();
 scope.role=role;
 const d=decision(),caseFile=createIntelligenceCase({
  scope,decision:d,threadId:'thread_01',asOf:at
 });
 return {f,args:{db,principal:actor(),caseFile,decision:d,
  scope,threadId:'thread_01',asOf:now}};
}
test('one authenticated owner case can be sealed and verified against current projected content',async()=>{
 const {args,f}=fixture();
 const captured=await captureCloudCaseContentBinding(args);
 assert.equal(captured.status,'captured_current_projection');
 assert.equal(captured.binding.kind,'tradeflow.intelligence.cloud-case-content-binding.v1');
 assert.match(captured.binding.projectedContentDigest,/^sha256:[a-f0-9]{64}$/);
 assert.equal(captured.binding.persistence,'in_process_only');
 assert.equal(captured.binding.readOnly,true);
 assert.equal(captured.binding.executionAuthority,false);
 assert.ok(Object.isFrozen(captured.binding));
 assert.ok(Object.isFrozen(captured.binding.actor));
 assert.doesNotMatch(JSON.stringify(captured.binding),/Service upgrade|200/);
 const checked=await inspectCurrentCloudCase({...args,contentBinding:captured.binding});
 assert.equal(checked.status,'current_projected_content_verified');
 assert.equal(checked.sourceContentVerified,true);
 assert.equal(checked.rawRecordBytesVerified,false);
 assert.equal(checked.executionAuthority,false);
 assert.equal(checked.commandExecuted,false);
 assert.equal(checked.contentScope,'allowlisted_evidence_projection');
 assert.equal(f.reads,2);
 assert.equal(f.writes,0);
});
test('same-revision changed allowed field invalidates a sealed intelligence case',async()=>{
 const {args,f}=fixture();
 const {binding}=await captureCloudCaseContentBinding(args);
 f.rows[0].payload=JSON.stringify({...record(),status:'Completed'});
 const result=await inspectCurrentCloudCase({...args,contentBinding:binding});
 assert.equal(result.status,'projected_source_content_changed');
 assert.equal(result.sourceContentVerified,false);
 assert.equal(result.executionAuthority,false);
});
test('unchanged revision but changed source timestamp invalidates a sealed case',async()=>{
 const {args,f}=fixture();
 const {binding}=await captureCloudCaseContentBinding(args);
 f.rows[0].updated_at='2026-11-04 08:01:00';
 assert.equal((await inspectCurrentCloudCase({...args,contentBinding:binding})).status,
  'projected_source_content_changed');
});
test('unapproved private fields are not included in the digest or represented as verified raw bytes',async()=>{
 const {args,f}=fixture();
 const {binding}=await captureCloudCaseContentBinding(args);
 f.rows[0].payload=JSON.stringify({...record(),privateHourlyRate:999});
 const result=await inspectCurrentCloudCase({...args,contentBinding:binding});
 assert.equal(result.status,'current_projected_content_verified');
 assert.equal(result.rawRecordBytesVerified,false);
});
test('serialized, forged and foreign-case bindings are rejected',async()=>{
 const {args}=fixture();
 const {binding}=await captureCloudCaseContentBinding(args);
 const forged=JSON.parse(JSON.stringify(binding));
 for(const invalid of [forged,{...binding},null,{},'sha256:'+ 'a'.repeat(64)]){
  assert.equal((await inspectCurrentCloudCase({...args,contentBinding:invalid})).status,
   'content_binding_untrusted');
 }
 const another=fixture();
 another.args.decision.binding='b'.repeat(64);
 another.args.caseFile=createIntelligenceCase({
  decision:another.args.decision,scope:another.args.scope,
  threadId:another.args.threadId,asOf:at
 });
 assert.equal((await inspectCurrentCloudCase({...another.args,contentBinding:binding})).status,
  'content_binding_untrusted');
});
test('member/viewer cases cannot use company-scope reader without atomic job-grant enforcement',async()=>{
 for(const role of ['member','viewer']){
  const {args,f}=fixture({role});
  assert.equal((await inspectCurrentCloudCase(args)).status,
   'scoped_member_context_unavailable');
  assert.equal((await captureCloudCaseContentBinding(args)).binding,null);
  assert.equal(f.reads,0,'must not read arbitrary company records for field actors');
 }
});
test('binding cannot bypass revoked membership, changed role or stale job revision',async()=>{
 const revoked=fixture();
 const {binding}=await captureCloudCaseContentBinding(revoked.args);
 revoked.f.active=false;
 assert.equal((await inspectCurrentCloudCase({...revoked.args,contentBinding:binding})).status,
  'access_or_evidence_unverified');
 const changed=fixture();
 const captured=await captureCloudCaseContentBinding(changed.args);
 changed.f.role='member';
 assert.equal((await inspectCurrentCloudCase({...changed.args,contentBinding:captured.binding})).status,
  'access_or_evidence_unverified');
 const stale=fixture();
 const prior=await captureCloudCaseContentBinding(stale.args);
 stale.f.rows[0].revision=3;
 assert.equal((await inspectCurrentCloudCase({...stale.args,contentBinding:prior.binding})).status,
  'stale_evidence');
});
test('legacy revision-only case inspection remains honest about content',async()=>{
 const {args}=fixture();
 const result=await inspectCurrentCloudCase(args);
 assert.equal(result.status,'current_revision_verified');
 assert.equal(result.sourceContentVerified,false);
 assert.equal(result.rawRecordBytesVerified,false);
 assert.equal(result.executionAuthority,false);
});
