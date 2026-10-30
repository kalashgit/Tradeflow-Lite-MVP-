'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const original={id:'q1',title:'Panel upgrade',customerId:'c1',status:'Sent',sentDate:'2026-10-01',businessId};
function fixture(){
 const db=createDB({customers:[{id:'c1',name:'Synthetic property owner',businessId}],quotes:[original]});
 let n=0;
 const args={db,kind:'quotation.followup.schedule',payload:{quoteId:'q1',due:'2026-10-30'},
  uid:()=> 'followup-'+(++n),requestKey:'owner-review-001',actor:'local-owner',businessId,
  approved:true,recordGuard:[{ref:{store:'quotes',id:'q1'},record:original}]};
 return {db,args};
}
test('explicitly approved quote follow-up creates one persistent internal task with audit, no contact claim',async()=>{
 const {db,args}=fixture(),result=await core.execute(args);
 assert.equal(result.reused,false);
 const data=await snapshot(db),task=data.tasks[0];
 assert.equal(task.id,result.id);assert.equal(task.quoteId,'q1');assert.equal(task.customerId,'c1');
 assert.equal(task.taskKind,'quotation_follow_up');assert.equal(task.status,'Open');
 assert.equal(data.quotes[0].status,'Sent');
 assert.equal(data.commandLog.filter(x=>x.kind==='quotation.followup.schedule').length,1);
 const event=data.commandLog.find(x=>x.kind==='domain.event');
 assert.equal(event.type,'task.created');assert.equal(event.ref.id,task.id);
 assert.equal(event.correlationId,'quote-followup:owner-review-001');
 assert.equal(data.commandLog.some(x=>x.result==='customer_contacted'),false);
});
test('repeated operation and fresh request keys do not generate duplicate open follow-up tasks',async()=>{
 const {db,args}=fixture();
 const results=await Promise.all([core.execute(args),core.execute(args)]);
 assert.equal(results[0].id,results[1].id);
 const fresh=await core.execute({...args,requestKey:'owner-review-002'});
 assert.equal(fresh.id,results[0].id);assert.equal(fresh.reused,true);
 const data=await snapshot(db);
 assert.equal(data.tasks.filter(t=>t.taskKind==='quotation_follow_up').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event').length,1);
});
test('denied approval, stale quotation and wrong tenant cannot create tasks',async()=>{
 const {db,args}=fixture(),before=await snapshot(db);
 await assert.rejects(core.execute({...args,approved:false}),/Explicit approved/);
 await assert.rejects(core.execute({...args,recordGuard:[]}),/Explicit approved/);
 assert.deepEqual(await snapshot(db),before);
 await put(db,'quotes',{...original,title:'Changed during review'});
 await assert.rejects(core.execute(args),/changed since approval/);
 assert.equal((await snapshot(db)).tasks.length,0);
 const other=fixture();
 await assert.rejects(core.execute({...other.args,businessId:'other_business'}),/another business/);
 assert.equal((await snapshot(other.db)).tasks.length,0);
});
test('invalid quote status, missing customer and key reuse reject without phantom outcomes',async()=>{
 const {db,args}=fixture();
 await put(db,'quotes',{...original,status:'Accepted'});
 await assert.rejects(core.execute({...args,recordGuard:[{ref:{store:'quotes',id:'q1'},record:{...original,status:'Accepted'}}]}),/Only sent/);
 const missing=fixture();
 await put(missing.db,'customers',{id:'c1',name:'Synthetic',businessId:'foreign_business'});
 await assert.rejects(core.execute(missing.args),/unavailable in this business/);
 const good=fixture();await core.execute(good.args);
 await assert.rejects(core.execute({...good.args,payload:{quoteId:'q1',due:'2026-11-01'}}),/different owner or payload/);
});
test('storage failure rolls back task and audit in the same transaction',async()=>{
 const {db,args}=fixture(),before=await snapshot(db);
 db.failPutOnce=true;
 await assert.rejects(core.execute(args),/Simulated audit\/storage failure/);
 assert.deepEqual(await snapshot(db),before);
});

test('existing command runtime requires approval and records verified task execution',async()=>{
 const commands=require('../public/command-registry.js');
 const {db}=fixture(),context={actor:'local-owner',businessId,sourcePage:'quotes',today:'2026-10-29'};
 let counter=0,invocations=0;
 const runtime=commands.createRuntime({
  snapshot:()=>snapshot(db),context:()=>context,uid:()=> 'cmd-'+(++counter),
  ledger:commands.createLedger(db),can:permission=>permission==='modify:quotation.followup.schedule',
  ports:{operation:async(kind,payload,proof)=>{
   invocations++;
   return core.execute({db,kind,payload,uid:()=> 'task-integration',
    requestKey:proof.requestKey,recordGuard:proof.recordGuard,
    actor:proof.actor,businessId:proof.businessId,approved:proof.approved});
  }}
 });
 const input={commandId:'quotation.followup.schedule',params:{ref:{store:'quotes',id:'q1'},due:'2026-10-30'}};
 const prepared=await runtime.prepare(input,{requestKey:'quote-followup-owner-approval'});
 assert.equal(prepared.status,'needs_review');
 assert.equal((await runtime.execute(prepared.id)).error.code,'APPROVAL_REQUIRED');
 assert.equal(invocations,0);
 assert.equal((await runtime.approve(prepared.id)).status,'approved');
 const result=await runtime.execute(prepared.id);
 assert.equal(result.status,'succeeded');assert.equal(invocations,1);
 assert.equal((await runtime.execute(prepared.id)).reused,true);
 assert.equal((await snapshot(db)).tasks.length,1);
 const log=(await snapshot(db)).commandLog.find(r=>r.id===prepared.id);
 assert.deepEqual(log.events.map(e=>e.type),['prepared','approved','executing','succeeded']);
});
test('command runtime rejects changed quotation before approved task creation',async()=>{
 const commands=require('../public/command-registry.js');
 const {db}=fixture();let i=0;
 const runtime=commands.createRuntime({
  snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-29'}),
  uid:()=> 'command-'+(++i),ledger:commands.createLedger(db),
  can:permission=>permission==='modify:quotation.followup.schedule',
  ports:{operation:()=>{throw Error('Must not execute stale command')}}
 });
 const p=await runtime.prepare({commandId:'quotation.followup.schedule',params:{ref:{store:'quotes',id:'q1'},due:'2026-10-30'}});
 assert.equal(p.status,'needs_review');
 await put(db,'quotes',{...original,title:'Changed scope'});
 assert.equal((await runtime.approve(p.id)).status,'stale');
 assert.equal((await snapshot(db)).tasks.length,0);
});

test('creating a follow-up task does not falsely clear stale quotation warning',async()=>{
 const commands=require('../public/command-registry.js');
 const {db,args}=fixture();
 assert.equal(commands.staleQuote(original,'2026-10-29',14),true);
 await core.execute(args);
 const after=await snapshot(db);
 assert.equal(commands.staleQuote(after.quotes[0],'2026-10-29',14),true,
  'Task creation is not customer contact or resolved follow-up evidence');
 const actualContact={...after.quotes[0],lastContactAt:'2026-10-29'};
 assert.equal(commands.staleQuote(actualContact,'2026-10-29',14),false,
  'Only separately recorded contact evidence advances the detector');
});

test('owner rejection leaves quotation and customer untouched and creates no task',async()=>{
 const commands=require('../public/command-registry.js'),{db}=fixture();
 let count=0;
 const runtime=commands.createRuntime({
  snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-29'}),
  uid:()=> 'reject-'+(++count),ledger:commands.createLedger(db),
  can:permission=>permission==='modify:quotation.followup.schedule',
  ports:{operation:()=>{throw Error('Rejected command must never execute')}}
 });
 const before=await snapshot(db);
 const p=await runtime.prepare({commandId:'quotation.followup.schedule',params:{ref:{store:'quotes',id:'q1'},due:'2026-10-30'}});
 assert.equal(p.status,'needs_review');
 assert.equal((await runtime.reject(p.id)).status,'rejected');
 assert.equal((await runtime.execute(p.id)).status,'rejected');
 const after=await snapshot(db);
 assert.deepEqual(after.quotes,before.quotes);
 assert.deepEqual(after.customers,before.customers);
 assert.equal(after.tasks.length,0);
 assert.deepEqual(after.commandLog.find(x=>x.id===p.id).events.map(x=>x.type),['prepared','rejected']);
});

test('approved scheduling reuses existing legacy automatic follow-up without duplicate records',async()=>{
 const {db,args}=fixture();
 await put(db,'tasks',{id:'legacy-task',title:'Follow up quote: Panel upgrade',quoteId:'q1',
  customerId:'c1',status:'Open',followupAuto:true,due:'2026-10-31'});
 const result=await core.execute(args);
 assert.equal(result.id,'legacy-task');assert.equal(result.reused,true);
 const state=await snapshot(db);
 assert.equal(state.tasks.length,1);
 assert.equal(state.commandLog.filter(x=>x.kind==='quotation.followup.schedule').length,1);
 assert.equal(state.commandLog.filter(x=>x.kind==='domain.event').length,0);
});
test('existing quote detail action uses the same reviewed command rather than a separate route',()=>{
 const fs=require('node:fs');
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/data-action="tfQuoteFollowupReview"/);
 assert.match(app,/commandId:'quotation.followup.schedule'/);
 assert.match(app,/commands\.approve\(plan\.id\)/);
 assert.match(app,/commands\.reject\(plan\.id\)/);
});

test('interrupted command reconciles a genuine committed task and audit after reload without rerun',async()=>{
 const commands=require('../public/command-registry.js'),{db}=fixture();let n=0,executions=0;
 const runtime=()=>commands.createRuntime({
  snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-29'}),
  uid:()=> 'recovery-'+(++n),ledger:commands.createLedger(db),
  can:permission=>permission==='modify:quotation.followup.schedule',
  ports:{operation:()=>{executions++;throw Error('Recovery must not run provider or task write again')}}
 });
 const first=runtime(),p=await first.prepare({commandId:'quotation.followup.schedule',
  params:{ref:{store:'quotes',id:'q1'},due:'2026-10-30'}});
 assert.equal((await first.approve(p.id)).status,'approved');
 const ledger=commands.createLedger(db);
 assert.equal((await ledger.transition(p.id,['approved'],{type:'executing',at:'2026-10-29T12:00:00Z'}, {status:'executing'})).claimed,true);
 const data=await snapshot(db),guard=commands.resolve({commandId:'quotation.followup.schedule',params:p.params},data,{actor:'local-owner',businessId}).guard;
 const saved=await core.execute({db,kind:'quotation.followup.schedule',
  payload:{quoteId:'q1',due:'2026-10-30'},uid:()=> 'saved-task',
  requestKey:'operation:'+p.id,actor:'local-owner',businessId,approved:true,recordGuard:guard});
 assert.equal(saved.id,'saved-task');
 const afterReload=runtime(),result=await afterReload.reconcile(p.id);
 assert.equal(result.status,'succeeded');assert.equal(result.result.reconciled,true);
 assert.equal((await afterReload.execute(p.id)).reused,true);
 assert.equal(executions,0);
 const final=await snapshot(db);
 assert.equal(final.tasks.length,1);
 const audit=final.commandLog.find(x=>x.id===p.id);
 assert.equal(audit.status,'succeeded');
 assert.ok(audit.events.some(e=>e.type==='reconciled'));
});
test('recovery stays indeterminate without a durable receipt and never writes',async()=>{
 const commands=require('../public/command-registry.js'),{db}=fixture();let n=0;
 const runtime=commands.createRuntime({
  snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-29'}),
  uid:()=> 'missing-'+(++n),ledger:commands.createLedger(db),
  can:permission=>permission==='modify:quotation.followup.schedule'});
 const p=await runtime.prepare({commandId:'quotation.followup.schedule',
  params:{ref:{store:'quotes',id:'q1'},due:'2026-10-30'}});
 await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'}, {status:'executing'});
 const before=await snapshot(db),outcome=await runtime.reconcile(p.id);
 assert.equal(outcome.status,'indeterminate');
 assert.equal(outcome.error.code,'RECEIPT_MISSING');
 assert.deepEqual(await snapshot(db),before);
 assert.equal((await runtime.execute(p.id)).status,'in_progress');
});
test('recovery refuses another actor and a receipt missing the task creation event',async()=>{
 const commands=require('../public/command-registry.js'),{db}=fixture();let n=0,actor='local-owner';
 const runtime=()=>commands.createRuntime({
  snapshot:()=>snapshot(db),context:()=>({actor,businessId,today:'2026-10-29'}),
  uid:()=> 'guarded-'+(++n),ledger:commands.createLedger(db),
  can:permission=>permission==='modify:quotation.followup.schedule'});
 const r=runtime(),p=await r.prepare({commandId:'quotation.followup.schedule',
  params:{ref:{store:'quotes',id:'q1'},due:'2026-10-30'}});
 await r.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'}, {status:'executing'});
 const data=await snapshot(db),guard=commands.resolve({commandId:'quotation.followup.schedule',params:p.params},data,{actor,businessId}).guard;
 await core.execute({db,kind:'quotation.followup.schedule',payload:{quoteId:'q1',due:'2026-10-30'},
  uid:()=> 'confirmed-task',requestKey:'operation:'+p.id,actor,businessId,approved:true,recordGuard:guard});
 actor='unexpected-actor';
 assert.equal((await runtime().reconcile(p.id)).status,'denied');
 actor='local-owner';
 const eventId=(await snapshot(db)).commandLog.find(x=>x.kind==='domain.event').id;
 await new Promise((resolve,reject)=>{const tx=db.transaction('commandLog','readwrite');tx.objectStore('commandLog').delete(eventId);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
 const noAudit=await runtime().reconcile(p.id);
 assert.equal(noAudit.status,'indeterminate');assert.equal(noAudit.error.code,'EVENT_UNVERIFIED');
 assert.equal((await snapshot(db)).tasks.length,1);
});

test('quote detail recovery action gates new approval on verified prior result',()=>{
 const fs=require('node:fs'),app=fs.readFileSync('public/app.js','utf8');
 const start=app.indexOf('async function tfReviewQuotationFollowup(quote){');
 const end=app.indexOf('async function tfReviewQuotationHandoff(',start);
 assert.ok(start>=0&&end>start);
 const section=app.slice(start,end);
 assert.match(section,/status==='executing'/);
 assert.match(section,/await commands\.reconcile\(pending\.id\)/);
 assert.match(section,/if\(recovery\.status!=='succeeded'\)/);
 assert.ok(section.indexOf('commands.reconcile(')<section.indexOf('commands.prepare('));
 assert.match(section,/An earlier follow-up is unresolved/);
});
test('recovery refuses mismatched operation receipt without changing existing task',async()=>{
 const commands=require('../public/command-registry.js'),{db}=fixture();let n=0;
 const runtime=commands.createRuntime({
  snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-29'}),
  uid:()=> 'tamper-'+(++n),ledger:commands.createLedger(db),
  can:p=>p==='modify:quotation.followup.schedule'});
 const plan=await runtime.prepare({commandId:'quotation.followup.schedule',
  params:{ref:{store:'quotes',id:'q1'},due:'2026-10-30'}});
 await runtime.approve(plan.id);
 await commands.createLedger(db).transition(plan.id,['approved'],{type:'executing'},{status:'executing'});
 const guard=commands.resolve({commandId:'quotation.followup.schedule',params:plan.params},
  await snapshot(db),{actor:'local-owner',businessId}).guard;
 await core.execute({db,kind:'quotation.followup.schedule',payload:{quoteId:'q1',due:'2026-10-30'},
  uid:()=> 'original-task',requestKey:'operation:'+plan.id,actor:'local-owner',businessId,approved:true,recordGuard:guard});
 const receiptId='quote-followup:operation:'+plan.id;
 const data=await snapshot(db),receipt=data.commandLog.find(e=>e.id===receiptId);
 await put(db,'commandLog',{...receipt,requestPayload:'{"quoteId":"another"}'});
 const result=await runtime.reconcile(plan.id);
 assert.equal(result.status,'indeterminate');assert.equal(result.error.code,'RECEIPT_MISMATCH');
 assert.equal((await snapshot(db)).tasks.length,1);
 assert.equal((await runtime.execute(plan.id)).status,'in_progress');
});

test('approved registry quote and customer snapshots execute through atomic core, and stale customer blocks',async()=>{
 const commands=require('../public/command-registry.js');
 const {db,args}=fixture();
 const command={commandId:'quotation.followup.schedule',params:{ref:{store:'quotes',id:'q1'},due:'2026-10-30'}};
 const context={actor:'local-owner',businessId,today:'2026-10-29'};
 const prepared=commands.resolve(command,await snapshot(db),context);
 assert.equal(prepared.status,'needs_review');
 assert.equal(prepared.guard.length,2,'Quote and linked customer must both be covered');
 const done=await core.execute({...args,requestKey:'registry-guarded-quote',
  recordGuard:prepared.guard});
 assert.equal(done.reused,false);assert.equal((await snapshot(db)).tasks.length,1);
 const another=fixture(),guarded=commands.resolve(command,await snapshot(another.db),context);
 await put(another.db,'customers',{id:'c1',name:'Changed after approval',businessId});
 await assert.rejects(core.execute({...another.args,requestKey:'changed-customer',
  recordGuard:guarded.guard}),/linked customer changed since approval/);
 assert.equal((await snapshot(another.db)).tasks.length,0);
});
