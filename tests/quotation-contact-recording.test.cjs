'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../public/core-integration.js');
const commands=require('../public/command-registry.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
function setup(){
 const db=createDB({customers:[{id:'c1',name:'Electrical customer',businessId:'local-business'}],
 quotes:[{id:'q1',customerId:'c1',status:'Sent',sentDate:'2026-10-01',title:'Panel work',businessId:'local-business'}]});
 let n=0;
 const request={db,kind:'customer.contact.record',payload:{customerId:'c1',quoteId:'q1',method:'Phone',notes:'Discussed electrical panel scope',outcome:'reached'},
  uid:()=> 'contact-'+(++n),requestKey:'manual-contact-001',actor:'local-owner',businessId:'local-business'};
 return {db,request};
}
test('manual quote contact and quotation contact timestamp are atomic, logged and distinguishable from delivery',async()=>{
 const {db,request}=setup();
 assert.equal(commands.staleQuote((await snapshot(db)).quotes[0],'2026-10-29',14),true);
 const outcome=await core.execute(request);
 const state=await snapshot(db);
 assert.equal(state.events.length,1);
 assert.equal(state.events[0].id,outcome.id);
 assert.equal(state.events[0].providerVerified,false);
 assert.equal(state.events[0].evidence,'operator_reported');
 assert.equal(state.events[0].method,'Phone');
 assert.ok(state.quotes[0].lastContactAt);
 assert.equal(commands.staleQuote(state.quotes[0],'2026-10-29',14),false);
 const receipt=state.commandLog.find(x=>x.kind==='customer.contact.record');
 assert.equal(receipt.resultId,outcome.id);
 assert.equal(receipt.providerVerified,false);
 assert.equal(receipt.result,'owner_attested_reached');
 assert.equal(state.events[0].customerReached,true);
 assert.equal(state.quotes[0].followupResolution.contactEventId,outcome.id);
 assert.equal(state.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='quotation.updated').length,1);
});
test('same operation is idempotent; different owner, payload or missing contact refuse reuse',async()=>{
 const {db,request}=setup(),first=await core.execute(request),again=await core.execute(request);
 assert.equal(again.id,first.id);assert.equal(again.reused,true);
 assert.equal((await snapshot(db)).events.length,1);
 await assert.rejects(core.execute({...request,actor:'different-owner'}),/different details or actor/);
 await assert.rejects(core.execute({...request,payload:{...request.payload,notes:'Changed notes'}}),/different details or actor/);
 const state=await snapshot(db);
 await new Promise((resolve,reject)=>{const tx=db.transaction('events','readwrite');
  tx.objectStore('events').delete(state.events[0].id);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
 await assert.rejects(core.execute(request),/requires recovery review/);
});
test('foreign customer, mismatched quote and invalid form data never write contact or quote',async()=>{
 const x=setup();
 await assert.rejects(core.execute({...x.request,businessId:'different-business'}),/customer unavailable/);
 await assert.rejects(core.execute({...x.request,payload:{...x.request.payload,method:'SMS'}}),/Valid manually/);
 await assert.rejects(core.execute({...x.request,payload:{...x.request.payload,notes:'x'}}),/Valid manually/);
 await put(x.db,'quotes',{id:'q1',customerId:'another',status:'Sent',businessId:'local-business'});
 await assert.rejects(core.execute(x.request),/no longer belongs/);
 const state=await snapshot(x.db);
 assert.equal(state.events.length,0);
 assert.equal(state.commandLog.length,0);
});
test('storage fault rolls back manual contact, quotation update and audit as one transaction',async()=>{
 const {db,request}=setup(),before=await snapshot(db);
 db.failPutOnce=true;
 await assert.rejects(core.execute(request),/Simulated audit\/storage failure/);
 assert.deepEqual(await snapshot(db),before);
});
test('customer UI routes one manual contact through existing core operation',()=>{
 const app=require('node:fs').readFileSync('public/app.js','utf8');
 assert.match(app,/kind:'customer.contact.record'/);
 assert.match(app,/Provider delivery remains unverified/);
 assert.match(app,/name="outcome"/);
 assert.doesNotMatch(app,/await put\('events',\{id:uid\(\),kind:'customer_contact'/);
});

test('unanswered contact attempt preserves open follow-up task and does not claim reached',async()=>{
 const {db,request}=setup();
 await put(db,'tasks',{id:'followup-1',quoteId:'q1',customerId:'c1',
  taskKind:'quotation_follow_up',status:'Open',businessId:'local-business'});
 const response=await core.execute({...request,payload:{...request.payload,outcome:'attempted',
  notes:'Called twice but no answer or reply'}});
 const after=await snapshot(db);
 assert.equal(response.outcome,'attempted');assert.equal(response.resolvedTasks,0);
 assert.equal(after.tasks[0].status,'Open');
 assert.equal(after.events[0].customerReached,false);
 assert.equal(after.events[0].providerVerified,false);
 assert.equal(after.quotes[0].lastContactAt,undefined);
 assert.ok(after.quotes[0].lastFollowUpAt);
 assert.equal(after.quotes[0].followupResolution,undefined);
});
test('owner attested reached contact atomically closes only linked open quote follow-up tasks',async()=>{
 const {db,request}=setup();
 await put(db,'tasks',{id:'followup-1',quoteId:'q1',customerId:'c1',
  taskKind:'quotation_follow_up',status:'Open',businessId:'local-business'});
 await put(db,'tasks',{id:'different-quote',quoteId:'q2',customerId:'c1',
  taskKind:'quotation_follow_up',status:'Open',businessId:'local-business'});
 await put(db,'tasks',{id:'other-work',quoteId:'q1',customerId:'c1',
  title:'Order switchgear',status:'Open',businessId:'local-business'});
 const done=await core.execute(request),after=await snapshot(db);
 assert.equal(done.outcome,'reached');assert.equal(done.resolvedTasks,1);
 const closed=after.tasks.find(t=>t.id==='followup-1');
 assert.equal(closed.status,'Done');
 assert.equal(closed.contactEventId,done.id);
 assert.equal(closed.completedReason,'owner_attested_customer_reached');
 assert.equal(after.tasks.find(t=>t.id==='different-quote').status,'Open');
 assert.equal(after.tasks.find(t=>t.id==='other-work').status,'Open');
 assert.ok(after.commandLog.some(e=>e.kind==='domain.event'&&
  e.type==='task.completed'&&e.ref.id==='followup-1'));
 const again=await core.execute(request);
 assert.equal(again.reused,true);
 assert.equal((await snapshot(db)).events.length,1);
});
test('reached contact storage failure rolls back quote resolution, task closure, and audit together',async()=>{
 const {db,request}=setup();
 await put(db,'tasks',{id:'followup-1',quoteId:'q1',customerId:'c1',
  taskKind:'quotation_follow_up',status:'Open'});
 const before=await snapshot(db);db.failPutOnce=true;
 await assert.rejects(core.execute(request),/Simulated audit\/storage failure/);
 assert.deepEqual(await snapshot(db),before);
});
test('invalid contact outcome refuses to save before transaction',async()=>{
 const {db,request}=setup(),before=await snapshot(db);
 await assert.rejects(core.execute({...request,payload:{...request.payload,outcome:'delivered'}}),/Valid manually/);
 assert.deepEqual(await snapshot(db),before);
});
