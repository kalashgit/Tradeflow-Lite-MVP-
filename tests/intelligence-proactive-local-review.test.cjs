'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let review;
before(async()=>{({reviewLocalTradeFlowRecords:review}=await import('../public/intelligence-proactive-local-review.js'))});
const scope={mode:'local',actor:'local-owner',businessId:'local-business'};
const now='2026-11-10T10:00:00.000Z',asOfDate='2026-11-10';
const snapshot=()=>({
 customers:[{id:'customer_1',businessId:'local-business',name:'Private Contractor Customer'}],
 jobs:[{id:'job_1',businessId:'local-business',title:'Service job',status:'In Progress',customerId:'customer_1',date:'2026-11-11'}],
 invoices:[{id:'invoice_1',businessId:'local-business',status:'Issued',customerId:'customer_1',jobId:'job_1',dueDate:'2026-11-09',currency:'USD'}],
 quotes:[{id:'quote_1',businessId:'local-business',status:'Sent',customerId:'customer_1',sentDate:'2026-10-15',currency:'USD'}]
});
test('existing device-local records become a single source-labelled read-only Master Intelligence turn',async()=>{
 const r=await review({snapshot:snapshot(),scope,asOfDate,now});
 assert.equal(r.kind,'tradeflow.intelligence.proactive.local-review.v1');
 assert.equal(r.scope,'device_local_only');
 assert.equal(r.turn.role,'assistant');
 assert.equal(r.turn.source,'device_local_evidence');
 assert.equal(r.turn.status,'committed');
 assert.equal(r.turn.modality,'text');
 assert.equal(r.executionAuthority,false);
 assert.equal(r.actionsExecuted,0);
 assert.equal(r.modelInvoked,false);
 assert.ok(r.detectedCount>=1);
 assert.ok(r.caseIndex.length>=1);
 assert.match(r.turn.content,/DEVICE-LOCAL PROACTIVE REVIEW/);
 assert.match(r.turn.content,/not authenticated cloud evidence/);
 assert.match(r.turn.content,/No record was changed, no message sent, no command executed/);
 assert.doesNotMatch(r.turn.content,/Private Contractor Customer/);
 assert.ok(r.turn.refs.length<=8);
});
test('replaying the same local source versions produces a stable, prioritised read-only case set',async()=>{
 const a=await review({snapshot:snapshot(),scope,asOfDate,now});
 const b=await review({snapshot:snapshot(),scope,asOfDate,now});
 assert.deepEqual(a.caseIndex,b.caseIndex);
 assert.deepEqual(a.ranked,b.ranked);
 assert.equal(a.turn.content,b.turn.content);
});
test('empty device-local workspace reports limited visibility without pretending it audited real cloud records',async()=>{
 const r=await review({snapshot:{},scope,asOfDate,now});
 assert.equal(r.detectedCount,0);
 assert.deepEqual(r.turn.refs,[]);
 assert.match(r.turn.content,/No open proactive cases/);
 assert.match(r.turn.content,/not a full audit/i);
 assert.equal(r.actionsExecuted,0);
});
test('foreign cloud or role impersonation is rejected before records are read',async()=>{
 for(const forged of [
  {...scope,mode:'cloud'},
  {...scope,businessId:'foreign_tenant'},
  {...scope,actor:'other_actor'},
  {...scope,role:'owner'},
  {...scope,identity:{issuer:'https://fake.test',subject:'local-owner'}}
 ])await assert.rejects(review({snapshot:snapshot(),scope:forged,asOfDate,now}),/device-local owner scope/);
});
test('large local snapshots fail closed instead of summarising an arbitrary first 200 records',async()=>{
 const big={invoices:Array.from({length:201},(_,i)=>({id:'inv_'+i,businessId:'local-business',status:'Issued',dueDate:'2026-11-09'}))};
 await assert.rejects(review({snapshot:big,scope,asOfDate,now}),/exceeds 200 records/);
});
test('invalid observation date cannot create a misleading case or change records',async()=>{
 await assert.rejects(review({snapshot:snapshot(),scope,asOfDate:'2026-02-30',now}),/evaluation unavailable/);
});
