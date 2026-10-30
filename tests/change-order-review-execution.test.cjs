'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../public/core-integration.js'),commands=require('../public/command-registry.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const job={id:'job-1',customerId:'customer-1',businessId,status:'In Progress',changeOrders:[{id:'co-1',description:'Panel reroute',amount:400,status:'proposed'}]};
const customer={id:'customer-1',name:'Synthetic customer',businessId};
const input={commandId:'job.change_order.review.schedule',params:{ref:{store:'jobs',id:'job-1'},changeOrderId:'co-1',due:'2026-11-02'}};
function fixture(){
 const db=createDB({jobs:[job],customers:[customer]});let count=0,calls=0;
 const context={actor:'local-owner',businessId,today:'2026-10-30'};
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),context:()=>context,uid:()=>`cmd-${++count}`,
  ledger:commands.createLedger(db),can:p=>p==='modify:job.change_order.review.schedule',
  ports:{operation:async(kind,payload,proof)=>{
   calls++;return core.execute({db,kind,payload,requestKey:proof.requestKey,recordGuard:proof.recordGuard,
    actor:proof.actor,businessId:proof.businessId,approved:proof.approved,uid:()=>`task-${count}`});
  }}});
 return {db,runtime,context,calls:()=>calls};
}
test('owner approval schedules an internal review with durable audit but never customer authorization',async()=>{
 const {db,runtime}=fixture();const p=await runtime.prepare(input);
 assert.equal(p.status,'needs_review');assert.equal((await runtime.execute(p.id)).error.code,'APPROVAL_REQUIRED');
 assert.equal((await runtime.approve(p.id)).status,'approved');
 assert.equal((await runtime.execute(p.id)).status,'succeeded');
 const saved=await snapshot(db),task=saved.tasks[0];
 assert.equal(task.jobId,'job-1');assert.equal(task.changeOrderId,'co-1');
 assert.equal(task.customerAuthorizationStatus,'unverified');
 assert.equal(saved.jobs[0].changeOrders[0].status,'proposed');
 assert.equal(saved.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='task.created').length,1);
 assert.deepEqual(saved.commandLog.find(x=>x.id===p.id).events.map(e=>e.type),['prepared','approved','executing','succeeded']);
 assert.equal((await runtime.execute(p.id)).reused,true);
});
test('rejection, missing permission and stale job never schedule extra work',async()=>{
 const rejected=fixture();const p=await rejected.runtime.prepare(input);
 assert.equal((await rejected.runtime.reject(p.id)).status,'rejected');
 assert.equal((await rejected.runtime.execute(p.id)).status,'rejected');
 assert.equal((await snapshot(rejected.db)).tasks.length,0);
 const stale=fixture();const q=await stale.runtime.prepare(input);
 await put(stale.db,'jobs',{...job,changeOrders:[{...job.changeOrders[0],amount:600}]});
 assert.equal((await stale.runtime.approve(q.id)).status,'stale');
 assert.equal((await snapshot(stale.db)).tasks.length,0);
 const noPermission=commands.createRuntime({snapshot:()=>snapshot(stale.db),context:()=>stale.context,
  ledger:commands.createLedger(stale.db),uid:()=> 'no-permission',can:()=>false});
 assert.equal((await noPermission.prepare(input)).status,'denied');
});
test('approved commands fail closed if job, customer or task relationships change before execution',async()=>{
 for(const type of ['job','customer','task']){
  const {db,runtime}=fixture();const p=await runtime.prepare(input);
  assert.equal((await runtime.approve(p.id)).status,'approved');
  if(type==='job')await put(db,'jobs',{...job,changeOrders:[{...job.changeOrders[0],status:'approved_recorded'}]});
  if(type==='customer')await put(db,'customers',{...customer,name:'Different customer information'});
  if(type==='task')await put(db,'tasks',{id:'external-task',jobId:'job-1',changeOrderId:'co-1',taskKind:'change_order_review',status:'Open',businessId});
  assert.equal((await runtime.execute(p.id)).status,'stale',type);
  const saved=await snapshot(db);assert.equal(saved.tasks.filter(t=>t.id.startsWith('task-')).length,0,type);
  assert.equal(saved.commandLog.some(x=>x.kind==='job.change_order.review.schedule'),false,type);
 }
});
test('duplicate reviews, rejected storage and foreign business cannot cause second task',async()=>{
 const {db,runtime}=fixture();const first=await runtime.prepare(input);await runtime.approve(first.id);
 await runtime.execute(first.id);
 const second=await runtime.prepare(input);assert.equal(second.status,'needs_review');
 await runtime.approve(second.id);const outcome=await runtime.execute(second.id);
 assert.equal(outcome.status,'succeeded');assert.equal(outcome.result.reused,true);
 assert.equal((await snapshot(db)).tasks.length,1);
 const foreign=fixture();const data=await snapshot(foreign.db);
 await assert.rejects(core.execute({db:foreign.db,kind:'job.change_order.review.schedule',
  payload:{jobId:'job-1',changeOrderId:'co-1',due:'2026-11-02'},uid:()=> 'foreign',requestKey:'foreign',
  approved:true,actor:'local-owner',businessId:'other-business',recordGuard:[{ref:{store:'jobs',id:'job-1'},record:job},{changeOrderOpenReviews:[]}]}),/outside this business/);
 assert.deepEqual(await snapshot(foreign.db),data);
 const fault=fixture();const before=await snapshot(fault.db);
 fault.db.failPutOnce=true;
 await assert.rejects(core.execute({db:fault.db,kind:'job.change_order.review.schedule',
  payload:{jobId:'job-1',changeOrderId:'co-1',due:'2026-11-02'},uid:()=> 'fault-task',requestKey:'fault',
  approved:true,actor:'local-owner',businessId,recordGuard:[{ref:{store:'jobs',id:'job-1'},record:job},{changeOrderOpenReviews:[]}]}));
 assert.deepEqual(await snapshot(fault.db),before);
});
test('interrupted command reconciles its receipt and task without executing again',async()=>{
 const {db,runtime,calls}=fixture();const p=await runtime.prepare(input);await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing',at:'2026-10-30'}, {status:'executing'});
 const guard=commands.resolve(input,await snapshot(db),{actor:'local-owner',businessId}).guard;
 await core.execute({db,kind:'job.change_order.review.schedule',payload:{jobId:'job-1',changeOrderId:'co-1',due:'2026-11-02'},
  uid:()=> 'completed-task',requestKey:'operation:'+p.id,actor:'local-owner',businessId,approved:true,recordGuard:guard});
 const result=await runtime.reconcile(p.id);
 assert.equal(result.status,'succeeded');assert.equal(result.result.reconciled,true);
 assert.equal(calls(),0);assert.equal((await snapshot(db)).tasks.length,1);
 const missing=fixture(),q=await missing.runtime.prepare(input);await missing.runtime.approve(q.id);
 await commands.createLedger(missing.db).transition(q.id,['approved'],{type:'executing'}, {status:'executing'});
 assert.equal((await missing.runtime.reconcile(q.id)).error.code,'RECEIPT_MISSING');
 assert.equal(missing.calls(),0);
});
test('recovery refuses inconsistent or missing audit evidence without replay',async()=>{
 const {db,runtime,calls}=fixture();const p=await runtime.prepare(input);await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'},{status:'executing'});
 const guard=commands.resolve(input,await snapshot(db),{actor:'local-owner',businessId}).guard;
 await core.execute({db,kind:'job.change_order.review.schedule',payload:{jobId:'job-1',changeOrderId:'co-1',due:'2026-11-02'},
  uid:()=> 'saved-task',requestKey:'operation:'+p.id,actor:'local-owner',businessId,approved:true,recordGuard:guard});
 const data=await snapshot(db),receipt=data.commandLog.find(x=>x.kind==='job.change_order.review.schedule');
 await put(db,'commandLog',{...receipt,changeOrderId:'different',requestPayload:'tampered'});
 assert.equal((await runtime.reconcile(p.id)).error.code,'RECEIPT_MISMATCH');
 assert.equal(calls(),0);
});
test('existing job dossier exposes reviewed action rather than customer approval',()=>{
 const fs=require('node:fs');const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/data-action="tfChangeOrderReview"/);
 assert.match(app,/commandId:'job.change_order.review.schedule'/);
 assert.match(app,/Customer approval is still unverified/);
});
