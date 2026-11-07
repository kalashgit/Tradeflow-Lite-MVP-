'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');

let projectEvidencePointers,proposeKnowledgeItem,inspectKnowledgeCandidate,localEvidence;
const businessId='business_123',at='2026-11-04T08:45:00.000Z';
const actor={issuer:'test-issuer',subject:'owner_01'};
const scope=()=>({mode:'cloud',businessId,identity:{...actor},role:'owner'});
const cloud=()=>({
 kind:'tradeflow.intelligence.context.v1',businessId,identity:{...actor},
 scope:{company:true},permission:{role:'owner'},
 readOnly:true,executionAuthority:false,
 records:[
  {type:'jobs',id:'job_01',revision:3,updatedAt:'2026-11-04 08:00:00',
   provenance:'tenant_record',contentTrust:'untrusted_record_content',
   record:{title:'Panel replacement',status:'In progress'}},
  {type:'jobCosts',id:'cost_01',revision:2,updatedAt:'2026-11-04 08:05:00',
   provenance:'tenant_record',contentTrust:'untrusted_record_content',
   record:{jobId:'job_01',category:'Labor',type:'actual',laborHours:12}}
 ]
});
function candidate(pointers,changes={}){
 return proposeKnowledgeItem({id:'candidate_01',kind:'learning_hypothesis',
  claim:'Recorded labor entries may need a scope review',
  subject:{entityType:'jobs',id:'job_01'},sourcePointers:pointers,observedAt:at,
  ...changes});
}
before(async()=>{
 ({projectEvidencePointers,proposeKnowledgeItem,inspectKnowledgeCandidate}=
  await import('../public/knowledge-fabric-contracts.js'));
 ({localEvidence}=await import('../public/intelligence-evidence.js'));
});

test('current tenant evidence projects bounded revision-linked pointers without authority',async()=>{
 const pointers=await projectEvidencePointers({context:cloud(),scope:scope(),observedAt:at});
 assert.deepEqual(pointers.map(p=>p.recordType),['jobCosts','jobs']);
 for(const p of pointers){
  assert.equal(p.schemaVersion,1);
  assert.equal(p.businessId,businessId);
  assert.equal(p.verification,'tenant_record_projection');
  assert.equal(p.visibility,'permission_filtered');
  assert.match(p.contentDigest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(p.executionAuthority,false);
  assert.equal(p.sourceUri,null);
  assert.deepEqual(p.actorScope,{mode:'cloud',issuer:actor.issuer,subject:actor.subject,role:'owner'});
  assert.ok(Object.isFrozen(p));
 }
 assert.equal(pointers.find(p=>p.recordType==='jobs').recordRevision,3);
 assert.equal(pointers.find(p=>p.recordType==='jobCosts').recordRevision,2);
 assert.ok(Object.isFrozen(pointers));
});

test('a derived KnowledgeItem remains an unsaved, unapproved candidate',async()=>{
 const pointers=await projectEvidencePointers({context:cloud(),scope:scope(),observedAt:at});
 const item=candidate(pointers);
 assert.equal(item.status,'candidate');
 assert.equal(item.confidence,'unverified');
 assert.equal(item.review.approvedBy,null);
 assert.equal(item.publishable,false);
 assert.equal(item.persistence,'not_saved');
 assert.equal(item.executionAuthority,false);
 assert.ok(Object.isFrozen(item));
 assert.ok(Object.isFrozen(item.sourceRefs[0]));
 const result=await inspectKnowledgeCandidate({item,context:cloud(),scope:scope(),asOf:at});
 assert.deepEqual(result,{status:'candidate_current_not_approved',executionAuthority:false});
});

test('revision changes and same-revision content edits invalidate a derived item',async()=>{
 const initial=cloud(),item=candidate(await projectEvidencePointers({
  context:initial,scope:scope(),observedAt:at}));
 const revised=cloud();revised.records[1].revision=3;
 assert.equal((await inspectKnowledgeCandidate({
  item,context:revised,scope:scope(),asOf:at
 })).status,'stale_source');
 const edited=cloud();edited.records[1].record.laborHours=99;
 assert.equal((await inspectKnowledgeCandidate({
  item,context:edited,scope:scope(),asOf:at
 })).status,'stale_source');
 assert.equal(initial.records[1].record.laborHours,12);
});

test('removed sources are unavailable, not falsely resolved or silently approved',async()=>{
 const item=candidate(await projectEvidencePointers({context:cloud(),scope:scope(),observedAt:at}));
 const missing=cloud();missing.records=missing.records.filter(r=>r.type!=='jobCosts');
 assert.equal((await inspectKnowledgeCandidate({
  item,context:missing,scope:scope(),asOf:at
 })).status,'source_unavailable_or_withheld');
});

test('actor, role or company change never reuses another principal\'s candidate',async()=>{
 const item=candidate(await projectEvidencePointers({context:cloud(),scope:scope(),observedAt:at}));
 const otherActor={...scope(),identity:{...actor,subject:'owner_02'}};
 const otherBusiness={...scope(),businessId:'business_999'};
 for(const changedScope of [otherActor,otherBusiness,{...scope(),role:'member'}]){
  assert.equal((await inspectKnowledgeCandidate({
   item,context:cloud(),scope:changedScope,asOf:at
  })).status,'scope_changed');
 }
 const wrong=cloud();wrong.identity.subject='owner_02';
 assert.equal((await inspectKnowledgeCandidate({
  item,context:wrong,scope:scope(),asOf:at
 })).status,'access_or_evidence_unverified');
});

test('candidate creation rejects foreign, duplicated, unsourced or malformed evidence',async()=>{
 const pointers=await projectEvidencePointers({context:cloud(),scope:scope(),observedAt:at});
 for(const bad of [
  [pointers[0],{...pointers[1],businessId:'business_999'}],
  [pointers[0],pointers[0]],
  [{...pointers[0],executionAuthority:true}],
  [{...pointers[0],contentDigest:'sha256:incomplete'}]
 ]){
  assert.throws(()=>candidate(bad));
 }
 assert.throws(()=>candidate(pointers,{claim:'  '}));
 assert.throws(()=>candidate(pointers,{subject:{entityType:'jobs',id:'unseen_job'}}));
 assert.throws(()=>candidate(pointers,{kind:'role_grant'}));
 assert.throws(()=>candidate(pointers,{sourcePointers:[]}));
});

test('unverified cloud record fields are rejected, not digested into private memory',async()=>{
 const bad=cloud();
 bad.records[0].record.privateHourlyRate=200;
 await assert.rejects(projectEvidencePointers({
  context:bad,scope:scope(),observedAt:at
 }),/unapproved fields/);
 const changed=cloud();changed.records[0].revision=null;
 await assert.rejects(projectEvidencePointers({
  context:changed,scope:scope(),observedAt:at
 }),/provenance/);
});

test('explicit device-local evidence retains local-only classification',async()=>{
 const localScope={mode:'local',businessId:'local-business',actor:'local-owner'};
 const context=await localEvidence({
  jobs:[{id:'job_01',title:'Sample local panel repair',status:'Planned'}]
 },localScope);
 const pointers=await projectEvidencePointers({context,scope:localScope,observedAt:at});
 assert.equal(pointers.length,1);
 assert.equal(pointers[0].recordRevision,null);
 assert.equal(pointers[0].verification,'device_local_projection');
 assert.equal(pointers[0].visibility,'device_local_only');
 const item=candidate(pointers);
 assert.equal(item.persistence,'not_saved');
 assert.equal((await inspectKnowledgeCandidate({item,context,scope:localScope,asOf:at})).status,
  'candidate_current_not_approved');
 assert.equal((await inspectKnowledgeCandidate({item,context:cloud(),scope:scope(),asOf:at})).status,
  'scope_changed');
});

test('expiry, observation and malformed candidate state fail closed',async()=>{
 const pointers=await projectEvidencePointers({context:cloud(),scope:scope(),observedAt:at});
 const expiring=candidate(pointers,{expiresAt:'2026-11-04T09:00:00.000Z'});
 assert.equal((await inspectKnowledgeCandidate({
  item:expiring,context:cloud(),scope:scope(),asOf:'2026-11-04T09:00:00.000Z'
 })).status,'expired');
 assert.equal((await inspectKnowledgeCandidate({
  item:{...expiring,status:'approved'},context:cloud(),scope:scope(),asOf:at
 })).status,'invalid_candidate');
 assert.equal((await inspectKnowledgeCandidate({
  item:expiring,context:cloud(),scope:scope(),asOf:'invalid'
 })).status,'invalid_time');
 await assert.rejects(projectEvidencePointers({
  context:cloud(),scope:scope(),observedAt:'invalid'
 }),/observation/);
 assert.throws(()=>candidate(pointers,{expiresAt:'2026-11-04T08:30:00.000Z'}));
});
