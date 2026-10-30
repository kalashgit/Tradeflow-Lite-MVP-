'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const cmd=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const source={id:'q1',businessId,customerId:'c1',title:'Panel replacement',category:'Electrical',amount:'1250',status:'Accepted'};
const request={commandId:'quotation.reuse.create',params:{ref:{store:'quotes',id:'q1'}}};
function fixture(){
 const db=createDB({customers:[{id:'c1',businessId,name:'Customer'}],quotes:[source]});
 let next=0,called=0,allowed=true;const ledger=cmd.createLedger(db);
 const runtime=()=>cmd.createRuntime({snapshot:()=>snapshot(db),
  context:()=>({actor:'local-owner',businessId,today:'2026-10-30'}),ledger,
  uid:()=> 'hardening-'+(++next),can:p=>allowed&&['modify:quotation.reuse.create','read'].includes(p),
  ports:{review:async()=>({readOnly:true}),
   operation:async(kind,payload,proof)=>{
    called++;return core.execute({db,kind,payload,requestKey:proof.requestKey,recordGuard:proof.recordGuard,
     approved:proof.approved,actor:proof.actor,businessId:proof.businessId,uid:()=> 'draft-'+(++next)});
   }}});
 return {db,ledger,runtime,calls:()=>called,allow:v=>{allowed=v}};
}
test('two runtime instances serialize concurrent execution of the same approved request',async()=>{
 const f=fixture(),a=f.runtime(),b=f.runtime();
 const [p,q]=await Promise.all([a.prepare(request,{requestKey:'same-approval'}),b.prepare(request,{requestKey:'same-approval'})]);
 assert.equal(p.id,q.id);assert.equal(p.status,'needs_review');
 const approvals=await Promise.all([a.approve(p.id),b.approve(q.id)]);
 assert.ok(approvals.every(x=>x.status==='approved'));
 const results=await Promise.all([a.execute(p.id),b.execute(q.id)]);
 assert.ok(results.some(x=>x.status==='succeeded'),JSON.stringify(results));
 assert.ok(results.every(x=>['succeeded','in_progress'].includes(x.status)),JSON.stringify(results));
 assert.equal(f.calls(),1);
 const data=await snapshot(f.db);
 assert.equal(data.quotes.filter(x=>x.sourceQuoteId==='q1').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='quotation.reuse.create').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='quotation.created').length,1);
 assert.equal((await a.execute(p.id)).status,'succeeded');
});
test('two distinct approved commands racing one source cannot create duplicate active drafts',async()=>{
 const f=fixture(),a=f.runtime(),b=f.runtime(),p=await a.prepare(request),q=await b.prepare(request);
 await Promise.all([a.approve(p.id),b.approve(q.id)]);
 const outcomes=await Promise.all([a.execute(p.id),b.execute(q.id)]);
 assert.ok(outcomes.some(x=>x.status==='succeeded'),JSON.stringify(outcomes));
 const data=await snapshot(f.db);
 assert.equal(data.quotes.filter(x=>x.sourceQuoteId==='q1').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='quotation.created').length,1);
});
test('forged approved status without durable approval evidence fails closed',async()=>{
 const f=fixture(),a=f.runtime(),p=await a.prepare(request);
 await f.ledger.transition(p.id,['needs_review'],{type:'corrupted',actor:'unknown'},{status:'approved'});
 const result=await a.execute(p.id);
 assert.equal(result.status,'denied');assert.equal(result.error.code,'APPROVAL_EVIDENCE_REQUIRED');
 assert.equal(f.calls(),0);assert.equal((await snapshot(f.db)).quotes.length,1);
});
test('revoked permission and changed source both block approved execution',async()=>{
 const f=fixture(),a=f.runtime(),p=await a.prepare(request);await a.approve(p.id);
 f.allow(false);assert.equal((await a.execute(p.id)).error.code,'PERMISSION_DENIED');
 f.allow(true);await put(f.db,'quotes',{...source,amount:'1400'});
 assert.equal((await a.execute(p.id)).status,'stale');
 assert.equal((await snapshot(f.db)).quotes.length,1);
});
test('failed storage write aborts draft, domain event and receipt together',async()=>{
 const f=fixture(),resolved=cmd.resolve(request,await snapshot(f.db),{actor:'local-owner',businessId});
 f.db.failPutOnce=true;
 await assert.rejects(core.execute({db:f.db,kind:'quotation.reuse.create',
  payload:{sourceQuoteId:'q1',title:source.title,category:source.category,amount:1250},
  requestKey:'operation:storage-fault',actor:'local-owner',businessId,approved:true,
  recordGuard:resolved.guard,uid:()=> 'failed-draft'}));
 const data=await snapshot(f.db);
 assert.equal(data.quotes.length,1);assert.equal(data.commandLog.length,0);
});
test('interrupted execution without matching receipt is indeterminate and never replayed',async()=>{
 const f=fixture(),a=f.runtime(),p=await a.prepare(request);await a.approve(p.id);
 await f.ledger.transition(p.id,['approved'],{type:'executing',actor:'local-owner'},{status:'executing'});
 const result=await a.reconcile(p.id);
 assert.equal(result.status,'indeterminate');assert.equal(result.error.code,'RECEIPT_MISSING');
 assert.equal(f.calls(),0);assert.equal((await snapshot(f.db)).quotes.length,1);
});
test('read-only operational review never calls the modification port',async()=>{
 const f=fixture(),a=f.runtime(),p=await a.prepare({commandId:'intelligence.review',params:{}});
 assert.equal(p.status,'ready');
 const result=await a.execute(p.id);
 assert.equal(result.status,'succeeded');assert.equal(result.result.readOnly,true);
 assert.equal(f.calls(),0);assert.equal((await snapshot(f.db)).quotes.length,1);
});
