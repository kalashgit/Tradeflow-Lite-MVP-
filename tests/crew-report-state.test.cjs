const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let projectCrewReportState;
before(async()=>({projectCrewReportState}=await import('../public/crew-report-state.js')));
const principal={issuer:'oidc',subject:'crew_01'};
const event={schemaVersion:1,eventId:'event_01',idempotencyKey:'op_01',businessId:'business_123',
 actorId:'crew_01',direction:'role_to_core',kind:'job_blocker_reported',
 subject:{type:'jobs',id:'job_01',revision:3},note:'Two required materials are missing'};
const row=(overrides={})=>({kind:'sync.change',businessId:event.businessId,
 actor:principal,change:{type:'jobs',id:'job_01',operationId:'op_01',baseRevision:3,
 record:{id:'job_01',businessId:event.businessId}},status:'pending',...overrides});
const proof=()=>({authenticated:true,actor:principal,businessId:event.businessId,type:'jobs',id:'job_01',revision:4,
 record:{fieldUpdates:[{eventId:'event_01',idempotencyKey:'op_01',actorId:'crew_01',
 actorIssuer:'oidc',kind:'job_blocker_reported',note:event.note}]}});
const project=(rows=[],serverReadback=null,changes={})=>projectCrewReportState({event,queueRows:rows,principal,serverReadback,...changes});
test('local draft and queued are not remotely committed',()=>{
 assert.equal(project().deliveryState,'local_draft');
 const queued=project([row()]);
 assert.equal(queued.deliveryState,'queued_local');
 assert.equal(project([row({actor:undefined})]).deliveryState,'queued_local');
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
