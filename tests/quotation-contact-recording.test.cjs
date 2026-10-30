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
  uid:()=> 'contact-'+(++n),requestKey:'manual-contact-001',actor:'local-owner',businessId:'local-business',
  approved:true,recordGuard:[{ref:{store:'customers',id:'c1'},record:{id:'c1',name:'Electrical customer',businessId:'local-business'}},
   {ref:{store:'quotes',id:'q1'},record:{id:'q1',customerId:'c1',status:'Sent',sentDate:'2026-10-01',title:'Panel work',businessId:'local-business'}}]};
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
 await assert.rejects(core.execute(x.request),/approval is stale|no longer belongs/);
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
 assert.match(app,/commandId:'customer.contact.record'/);
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

test('shared command runtime authorizes owner-reached contact and closes linked follow-up only once',async()=>{
 const {db}=setup();const commands=require('../public/command-registry.js');
 await put(db,'tasks',{id:'followup-1',quoteId:'q1',customerId:'c1',taskKind:'quotation_follow_up',
  status:'Open',businessId:'local-business'});
 let n=0;const runtime=()=>commands.createRuntime({
  snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId:'local-business',today:'2026-10-29'}),
  uid:()=> 'contact-command-'+(++n),ledger:commands.createLedger(db),
  can:permission=>permission==='modify:customer.contact.record',
  ports:{operation:async(kind,payload,proof)=>core.execute({db,kind,payload,uid:()=> 'interaction-1',
   requestKey:proof.requestKey,actor:proof.actor,businessId:proof.businessId,
   approved:proof.approved,recordGuard:proof.recordGuard})}
 });
 const cmd={commandId:'customer.contact.record',params:{ref:{store:'customers',id:'c1'},quoteId:'q1',
  method:'Phone',notes:'Spoke directly to owner and confirmed estimate review',outcome:'reached'}};
 const first=runtime(),review=await first.prepare(cmd);
 assert.equal(review.status,'needs_review');
 assert.equal((await first.execute(review.id)).error.code,'APPROVAL_REQUIRED');
 assert.equal((await first.approve(review.id)).status,'approved');
 const completed=await first.execute(review.id);
 assert.equal(completed.status,'succeeded');assert.equal(completed.result.resolvedTasks,1);
 assert.equal((await snapshot(db)).tasks[0].status,'Done');
 assert.equal((await runtime().execute(review.id)).reused,true);
 assert.equal((await snapshot(db)).events.length,1);
});
test('approved contact recording refuses changed customer or quote before commit',async()=>{
 const {db}=setup();const commands=require('../public/command-registry.js');
 const intent={commandId:'customer.contact.record',params:{ref:{store:'customers',id:'c1'},
  quoteId:'q1',method:'Phone',notes:'Spoke to owner',outcome:'reached'}};
 const guarded=commands.resolve(intent,await snapshot(db),
  {actor:'local-owner',businessId:'local-business'});
 assert.equal(guarded.status,'needs_review');
 assert.equal(guarded.guard.length,2);
 await put(db,'customers',{id:'c1',name:'Another customer name',businessId:'local-business'});
 await assert.rejects(core.execute({db,kind:'customer.contact.record',
  uid:()=> 'failed',requestKey:'stale-contact',actor:'local-owner',businessId:'local-business',
  approved:true,recordGuard:guarded.guard,
  payload:{customerId:'c1',quoteId:'q1',method:'Phone',notes:'Spoke to owner',outcome:'reached'}}),/approval is stale/);
 assert.equal((await snapshot(db)).events.length,0);
});

test('TF-P01 full lifecycle: approved quote task, attempted contact, reached contact, audit and no post-resolution task',async()=>{
 const {db}=setup(),ctx={actor:'local-owner',businessId:'local-business',today:'2026-10-29'};
 let n=0;
 const runtime=()=>commands.createRuntime({snapshot:()=>snapshot(db),context:()=>ctx,
  uid:()=> 'lifecycle-command-'+(++n),ledger:commands.createLedger(db),
  can:p=>['modify:quotation.followup.schedule','modify:customer.contact.record'].includes(p),
  ports:{operation:async(kind,payload,proof)=>core.execute({db,kind,payload,
   uid:()=> 'lifecycle-record-'+(++n),requestKey:proof.requestKey,
   actor:proof.actor,businessId:proof.businessId,approved:proof.approved,recordGuard:proof.recordGuard})}});
 const cmd=runtime();
 const taskPlan=await cmd.prepare({commandId:'quotation.followup.schedule',
  params:{ref:{store:'quotes',id:'q1'},due:'2026-11-02'}});
 assert.equal(taskPlan.status,'needs_review');
 assert.equal((await cmd.approve(taskPlan.id)).status,'approved');
 const saved=await cmd.execute(taskPlan.id);
 assert.equal(saved.status,'succeeded');
 const taskId=saved.result.id;
 const attempt=await cmd.prepare({commandId:'customer.contact.record',
  params:{ref:{store:'customers',id:'c1'},quoteId:'q1',method:'Phone',
   notes:'Called customer, nobody answered',outcome:'attempted'}});
 assert.equal(attempt.status,'needs_review');await cmd.approve(attempt.id);
 assert.equal((await cmd.execute(attempt.id)).status,'succeeded');
 let state=await snapshot(db);
 assert.equal(state.tasks.find(t=>t.id===taskId).status,'Open');
 assert.equal(state.quotes[0].lastContactAt,undefined);
 assert.ok(state.quotes[0].lastFollowUpAt);
 const reached=await runtime().prepare({commandId:'customer.contact.record',
  params:{ref:{store:'customers',id:'c1'},quoteId:'q1',method:'Phone',
   notes:'Spoke to customer and confirmed estimate discussion',outcome:'reached'}});
 assert.equal(reached.status,'needs_review');await runtime().approve(reached.id);
 const resolved=await runtime().execute(reached.id);
 assert.equal(resolved.status,'succeeded');
 assert.equal(resolved.result.resolvedTasks,1);
 state=await snapshot(db);
 assert.equal(state.tasks.find(t=>t.id===taskId).status,'Done');
 assert.equal(state.tasks.find(t=>t.id===taskId).contactEventId,resolved.result.id);
 assert.equal(state.quotes[0].followupResolution.contactEventId,resolved.result.id);
 assert.equal(state.quotes[0].followupResolution.providerVerified,false);
 assert.equal(state.events.length,2);
 assert.equal(state.commandLog.filter(e=>e.kind==='domain.event'&&e.type==='task.completed').length,1);
 const additional=await runtime().prepare({commandId:'quotation.followup.schedule',
  params:{ref:{store:'quotes',id:'q1'},due:'2026-11-03'}});
 assert.equal(additional.status,'invalid');
 assert.equal((await snapshot(db)).tasks.length,1);
});
test('interrupted approved reached contact reconciles from event, quote, task and journal without replay',async()=>{
 const {db}=setup();await put(db,'tasks',{id:'t1',quoteId:'q1',customerId:'c1',taskKind:'quotation_follow_up',
  status:'Open',businessId:'local-business'});
 let sequence=0,actualOperations=0;
 const runtime=()=>commands.createRuntime({
  snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId:'local-business',today:'2026-10-29'}),
  uid:()=> 'recover-'+(++sequence),ledger:commands.createLedger(db),
  can:p=>p==='modify:customer.contact.record',
  ports:{operation:()=>{actualOperations++;throw Error('Must not replay an already committed contact')}}});
 const first=runtime(),params={ref:{store:'customers',id:'c1'},quoteId:'q1',
  method:'Phone',notes:'Spoke to customer and agreed next step',outcome:'reached'};
 const plan=await first.prepare({commandId:'customer.contact.record',params});
 assert.equal(plan.status,'needs_review');assert.equal((await first.approve(plan.id)).status,'approved');
 await commands.createLedger(db).transition(plan.id,['approved'],{type:'executing'},{status:'executing'});
 const guard=commands.resolve({commandId:'customer.contact.record',params},
  await snapshot(db),{actor:'local-owner',businessId:'local-business'}).guard;
 const persisted=await core.execute({db,kind:'customer.contact.record',payload:{
  customerId:'c1',quoteId:'q1',method:params.method,notes:params.notes,outcome:'reached'},
  uid:()=> 'recovered-contact',requestKey:'operation:'+plan.id,
  actor:'local-owner',businessId:'local-business',approved:true,recordGuard:guard});
 assert.equal(persisted.resolvedTasks,1);
 const afterReload=runtime(),recovered=await afterReload.reconcile(plan.id);
 assert.equal(recovered.status,'succeeded');assert.equal(recovered.result.reconciled,true);
 assert.equal((await afterReload.execute(plan.id)).reused,true);
 assert.equal(actualOperations,0);
 const state=await snapshot(db);
 assert.equal(state.events.length,1);assert.equal(state.tasks.find(t=>t.id==='t1').status,'Done');
});

test('existing quote dossier opens preselected linked customer outcome form and honors reviewed command lifecycle',()=>{
 const fs=require('node:fs'),app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/data-action="tfQuoteContactOutcome"/);
 assert.match(app,/tfContactQuotePrefill=quote\.id/);
 assert.match(app,/tfContactQuotePrefill===q\.id\?' selected'/);
 assert.match(app,/name="outcome"/);
 assert.match(app,/commandId:'customer\.contact\.record'/);
 assert.match(app,/await commands\.approve\(plan\.id\)/);
 assert.match(app,/await commands\.execute\(plan\.id\)/);
 assert.match(app,/commands\.reconcile\(previous\.id\)/);
 assert.match(app,/Provider delivery remains unverified/);
});
