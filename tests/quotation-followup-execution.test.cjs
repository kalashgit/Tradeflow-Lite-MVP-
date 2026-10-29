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
