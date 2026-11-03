const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let projectCrewReportState;
before(async()=>({projectCrewReportState}=await import('../public/crew-report-state.js')));
const principal={issuer:'oidc',subject:'crew_01'};
const event={schemaVersion:1,eventId:'event_01',idempotencyKey:'op_01',businessId:'business_123',
 actorId:'crew_01',direction:'role_to_core',kind:'job_blocker_reported',eventAt:'2026-11-03T08:00:00.000Z',
 subject:{type:'jobs',id:'job_01',revision:3},note:'Two required materials are missing'};
const reportUpdate=()=>({eventId:event.eventId,idempotencyKey:event.idempotencyKey,actorId:principal.subject,
 actorIssuer:principal.issuer,kind:event.kind,note:event.note,eventAt:event.eventAt});
const row=(overrides={})=>({id:'sync:'+event.businessId+':'+event.idempotencyKey,
 kind:'sync.change',businessId:event.businessId,actor:principal,change:{type:'jobs',id:'job_01',operationId:'op_01',baseRevision:3,
 record:{id:'job_01',businessId:event.businessId,fieldUpdates:[reportUpdate()]}},status:'pending',...overrides});
const proof=()=>({authenticated:true,actor:principal,businessId:event.businessId,type:'jobs',id:'job_01',revision:4,
 record:{fieldUpdates:[reportUpdate()]}});
const project=(rows=[],serverReadback=null,changes={})=>projectCrewReportState({event,queueRows:rows,principal,serverReadback,...changes});
test('local draft and queued are not remotely committed',()=>{
 assert.equal(project([],null,{event:{...event,deliveryState:'local_draft'}}).deliveryState,'local_draft');
 assert.equal(project().deliveryState,'delivery_uncertain');
 const queued=project([row()]);
 assert.equal(queued.deliveryState,'queued_local');
 assert.equal(project([row({actor:undefined})]).deliveryState,'queued_local');
 assert.equal(project([],null,{event:{...event,deliveryState:'queued'}}).deliveryState,'delivery_uncertain');
 assert.equal(queued.remoteRevision,null);
 assert.equal(queued.acknowledged,false);
 assert.equal(queued.executionAuthority,false);
});
test('sending and uncertain write never claim delivery',()=>{
 assert.equal(project([row({status:'sending'})]).deliveryState,'sending_unverified');
 assert.equal(project([row({status:'pending',writeUncertain:true})]).deliveryState,'delivery_uncertain');
});
test('verified generic queue receipt alone cannot prove report delivery',()=>{
 const applied=row({status:'applied',verifiedBy:principal,result:'verified_write',verification:'record_readback',remoteRevision:4});
 assert.equal(project([applied]).deliveryState,'delivery_uncertain');
 assert.equal(project([applied],proof()).deliveryState,'readback_verified');
});
test('tampered, foreign and wrong-actor readback is rejected',()=>{
 const applied=row({status:'applied',result:'verified_write',verification:'record_readback',remoteRevision:4});
 for(const p of [{...proof(),businessId:'foreign'}, {...proof(),authenticated:false},
 {...proof(),revision:5}, {...proof(),record:{fieldUpdates:[{...proof().record.fieldUpdates[0],actorId:'other'}]}}])
  assert.equal(project([applied],p).deliveryState,'delivery_uncertain');
});
test('identity and revision mismatch fail closed',()=>{
 assert.equal(project([row({actor:{issuer:'oidc',subject:'other'}})]).deliveryState,'identity_or_revision_mismatch');
 assert.equal(project([row({change:{...row().change,baseRevision:2}})]).deliveryState,'identity_or_revision_mismatch');
 assert.throws(()=>project([],null,{principal:{issuer:'oidc',subject:'other'}}));
});
test('conflict, failure, duplicates and ambiguous rows never produce success',()=>{
 assert.equal(project([row({status:'conflict'})]).deliveryState,'conflict_needs_review');
 assert.equal(project([row({status:'failed'})]).deliveryState,'failed_needs_review');
 assert.throws(()=>project([row(),row()]),/Ambiguous/);
});

test('verified actor is required even with an otherwise valid readback',()=>{
 const applied=row({status:'applied',result:'verified_write',verification:'record_readback',remoteRevision:4});
 assert.equal(project([applied],proof()).deliveryState,'delivery_uncertain');
 assert.equal(project([row({...applied,verifiedBy:principal})],{...proof(),actor:{issuer:'oidc',subject:'other'}}).deliveryState,'delivery_uncertain');
});

test('unrelated job write with same operation ID does not become report delivery',()=>{
 const unrelated=row({change:{...row().change,record:{id:'job_01',businessId:event.businessId,fieldUpdates:[]}}});
 assert.equal(project([unrelated]).deliveryState,'identity_or_revision_mismatch');
 const applied={...unrelated,status:'applied',verifiedBy:principal,result:'verified_write',verification:'record_readback',remoteRevision:4};
 assert.equal(project([applied],proof()).deliveryState,'identity_or_revision_mismatch');
});
test('duplicate or mismatched report content fails closed',()=>{
 for(const updates of [[reportUpdate(),reportUpdate()],[{...reportUpdate(),note:'tampered'}],
   [{...reportUpdate(),eventAt:'2026-11-03T09:00:00.000Z'}]]){
  const bad=row({change:{...row().change,record:{...row().change.record,fieldUpdates:updates}}});
  assert.equal(project([bad]).deliveryState,'identity_or_revision_mismatch');
 }
});
test('later authenticated readback revision retains verified immutable event',()=>{
 const applied=row({status:'applied',verifiedBy:principal,result:'verified_write',verification:'record_readback',remoteRevision:4});
 assert.equal(project([applied],{...proof(),revision:6}).deliveryState,'readback_verified');
 assert.equal(project([applied],{...proof(),revision:3}).deliveryState,'delivery_uncertain');
});
test('readback cannot contain duplicate event or altered timestamp',()=>{
 const applied=row({status:'applied',verifiedBy:principal,result:'verified_write',verification:'record_readback',remoteRevision:4});
 assert.equal(project([applied],{...proof(),record:{fieldUpdates:[reportUpdate(),reportUpdate()]}}).deliveryState,'delivery_uncertain');
 assert.equal(project([applied],{...proof(),record:{fieldUpdates:[{...reportUpdate(),eventAt:'2026-11-03T10:00:00.000Z'}]}}).deliveryState,'delivery_uncertain');
});

test('operation ID reused for another job or record type fails closed',()=>{
 const badJob=row({change:{...row().change,id:'job_02'}});
 const badType=row({change:{...row().change,type:'tasks'}});
 const badKey=row({id:'sync:business_123:forged'});
 for(const bad of [badJob,badType,badKey]){
  assert.equal(project([bad]).deliveryState,'identity_or_revision_mismatch');
  assert.equal(project([bad]).requiresReview,true);
 }
});
test('contradictory queue actor identities cannot be verified',()=>{
 const applied=row({status:'applied',verifiedBy:principal,result:'verified_write',verification:'record_readback',remoteRevision:4});
 for(const overrides of [
  {approvedBy:{issuer:'oidc',subject:'other'}},
  {verifiedBy:{issuer:'oidc',subject:'other'}},
  {actor:undefined,approvedBy:undefined}
 ]){
  const state=project([{...applied,...overrides}],proof());
  assert.notEqual(state.deliveryState,'readback_verified');
  assert.equal(state.requiresReview,true);
 }
});
test('only an explicitly local draft may be reported without queue evidence',()=>{
 for(const deliveryState of ['queued','sending','readback_verified','server_committed_unverified','other']){
  const state=project([],null,{event:{...event,deliveryState}});
  assert.equal(state.deliveryState,'delivery_uncertain');
  assert.equal(state.requiresReview,true);
 }
});

test('server readback for a deleted or foreign-identity job is not delivery proof',()=>{
 const applied=row({status:'applied',verifiedBy:principal,result:'verified_write',
  verification:'record_readback',remoteRevision:4});
 assert.equal(project([applied],proof()).deliveryState,'readback_verified');
 for(const bad of [
  {...proof(),deletedAt:'2026-11-03T10:00:00.000Z'},
  {...proof(),record:{...proof().record,id:'job_02'}},
  {...proof(),record:{...proof().record,businessId:'business_other'}},
  {...proof(),record:[]}
 ]){
  const projected=project([applied],bad);
  assert.equal(projected.deliveryState,'delivery_uncertain');
  assert.equal(projected.acknowledged,false);
  assert.equal(projected.actionReceiptRef,null);
 }
});
test('verified-write revisions must be exactly one more than the source revision',()=>{
 const impossible=row({status:'applied',verifiedBy:principal,result:'verified_write',
  verification:'record_readback',remoteRevision:6});
 assert.equal(project([impossible],{...proof(),revision:6}).deliveryState,'delivery_uncertain');
 const reconciled={...impossible,result:'already_current'};
 assert.equal(project([reconciled],{...proof(),revision:6}).deliveryState,'readback_verified');
});
