'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../public/core-integration.js'),commands=require('../public/command-registry.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const invoice={id:'i1',reference:'INV-01',customerId:'c1',status:'Issued',dueDate:'2026-01-01',currency:'USD',taxRate:0,
 lines:[{description:'Panel',qty:2,unitPrice:100}],businessId};
function fixture(payments=[]){
 const db=createDB({invoices:[invoice],customers:[{id:'c1',name:'Pilot customer',businessId}],payments});
 let index=0;
 const getGuard=async()=>commands.resolve({commandId:'invoice.followup.schedule',
  params:{ref:{store:'invoices',id:'i1'},due:'2026-11-02'}},await snapshot(db),
  {actor:'local-owner',businessId,today:'2026-10-29'}).guard;
 const execute=async(overrides={})=>core.execute({db,kind:'invoice.followup.schedule',uid:()=> 'task-'+(++index),
  payload:{invoiceId:'i1',due:'2026-11-02'},requestKey:'approve-01',actor:'local-owner',businessId,approved:true,
  recordGuard:await getGuard(),...overrides});
 return {db,getGuard,execute};
}
test('approved overdue invoice follow-up creates one internal task, event and receipt',async()=>{
 const f=fixture([{id:'payment1',invoiceId:'i1',customerId:'c1',amount:50,currency:'USD'}]);
 const result=await f.execute(),data=await snapshot(f.db);
 assert.equal(result.reused,false);assert.equal(data.tasks.length,1);
 assert.equal(data.tasks[0].invoiceId,'i1');assert.equal(data.tasks[0].customerId,'c1');
 assert.equal(data.tasks[0].taskKind,'invoice_follow_up');
 assert.equal(data.tasks[0].providerVerified,undefined);
 assert.equal(data.commandLog.filter(x=>x.kind==='invoice.followup.schedule').length,1);
 const journal=data.commandLog.find(x=>x.kind==='domain.event');
 assert.equal(journal.type,'task.created');assert.equal(journal.ref.id,result.id);
 assert.equal(data.invoices[0].status,'Issued');assert.equal(data.payments.length,1);
});
test('repeated and distinct approved keys do not create duplicate open tasks',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.execute(),f.execute()]);
 assert.equal(a.id,b.id);
 const c=await f.execute({requestKey:'approve-02'});
 assert.equal(c.id,a.id);assert.equal(c.reused,true);
 const state=await snapshot(f.db);
 assert.equal(state.tasks.length,1);
 assert.equal(state.commandLog.filter(x=>x.kind==='domain.event').length,1);
});
test('stale payment, paid balance, and foreign tenant refuse write',async()=>{
 const f=fixture(),guard=await f.getGuard();
 await put(f.db,'payments',{id:'payment1',invoiceId:'i1',customerId:'c1',amount:200,currency:'USD'});
 await assert.rejects(f.execute({recordGuard:guard}),/payments changed since approval/);
 assert.equal((await snapshot(f.db)).tasks.length,0);
 const resolution=commands.resolve({commandId:'invoice.followup.schedule',
  params:{ref:{store:'invoices',id:'i1'},due:'2026-11-02'}},await snapshot(f.db),
  {businessId,today:'2026-10-29'});
 assert.equal(resolution.error.code,'NO_BALANCE');
 const g=fixture();
 await assert.rejects(g.execute({businessId:'other-business'}),/another business|unavailable in this business/);
 assert.equal((await snapshot(g.db)).tasks.length,0);
});
test('approval and storage errors cannot leave partial follow-up or audit records',async()=>{
 const f=fixture(),before=await snapshot(f.db);
 await assert.rejects(f.execute({approved:false}),/Approved invoice/);
 assert.deepEqual(await snapshot(f.db),before);
 f.db.failPutOnce=true;
 await assert.rejects(f.execute(),/Simulated audit\/storage failure/);
 assert.deepEqual(await snapshot(f.db),before);
});
test('existing command runtime requires explicit owner approval for invoice follow-up',async()=>{
 const f=fixture(),db=f.db;let n=0,calls=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),
  context:()=>({actor:'local-owner',businessId,today:'2026-10-29'}),
  uid:()=> 'command-'+(++n),ledger:commands.createLedger(db),
  can:permission=>permission==='modify:invoice.followup.schedule',
  ports:{operation:async(kind,payload,proof)=>{calls++;return core.execute({db,kind,payload,
    uid:()=> 'approved-invoice-task',requestKey:proof.requestKey,recordGuard:proof.recordGuard,
    actor:proof.actor,businessId:proof.businessId,approved:proof.approved})}}
 });
 const plan=await runtime.prepare({commandId:'invoice.followup.schedule',
  params:{ref:{store:'invoices',id:'i1'},due:'2026-11-02'}});
 assert.equal(plan.status,'needs_review');
 assert.equal((await runtime.execute(plan.id)).error.code,'APPROVAL_REQUIRED');assert.equal(calls,0);
 assert.equal((await runtime.approve(plan.id)).status,'approved');
 const outcome=await runtime.execute(plan.id);
 assert.equal(outcome.status,'succeeded');assert.equal(calls,1);
 assert.equal((await runtime.execute(plan.id)).reused,true);
 const audit=(await snapshot(db)).commandLog.find(x=>x.id===plan.id);
 assert.deepEqual(audit.events.map(e=>e.type),['prepared','approved','executing','succeeded']);
});
test('owner rejection and changed invoice before approval keep audit but no task',async()=>{
 const f=fixture(),db=f.db;let n=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),
  context:()=>({actor:'local-owner',businessId,today:'2026-10-29'}),
  uid:()=> 'command-'+(++n),ledger:commands.createLedger(db),
  can:permission=>permission==='modify:invoice.followup.schedule'});
 const command={commandId:'invoice.followup.schedule',params:{ref:{store:'invoices',id:'i1'},due:'2026-11-02'}};
 const reject=await runtime.prepare(command);
 assert.equal((await runtime.reject(reject.id)).status,'rejected');
 assert.equal((await runtime.execute(reject.id)).status,'rejected');
 const review=await runtime.prepare(command);
 await put(db,'invoices',{...invoice,reference:'INV-CHANGED'});
 assert.equal((await runtime.approve(review.id)).status,'stale');
 assert.equal((await snapshot(db)).tasks.length,0);
});
test('existing revenue button invokes approved bridge, not direct task writes',()=>{
 const fs=require('node:fs'),revenue=fs.readFileSync('public/revenue.js','utf8'),
  app=fs.readFileSync('public/app.js','utf8');
 assert.match(revenue,/await api\.scheduleInvoiceFollowup\(inv,due\)/);
 assert.match(app,/scheduleInvoiceFollowup:async\(invoice,due\)/);
 assert.match(app,/modify:invoice\.followup\.schedule/);
 assert.match(app,/commandId:'invoice\.followup\.schedule'/);
 const start=revenue.indexOf(" if(a==='followup'){"),end=revenue.indexOf(" if(a==='record'){",start);
 assert.ok(start>=0&&end>start);
 assert.doesNotMatch(revenue.slice(start,end),/api\.put\('tasks'/);
});

test('interrupted invoice task reconciles receipt and event after reload with no second execution',async()=>{
 const f=fixture(),db=f.db;let n=0,executions=0;
 const make=()=>commands.createRuntime({snapshot:()=>snapshot(db),
  context:()=>({actor:'local-owner',businessId,today:'2026-10-29'}),
  uid:()=> 'recovery-'+(++n),ledger:commands.createLedger(db),
  can:p=>p==='modify:invoice.followup.schedule',
  ports:{operation:()=>{executions++;throw Error('Must not replay after interruption')}}});
 const original=make(),plan=await original.prepare({commandId:'invoice.followup.schedule',
  params:{ref:{store:'invoices',id:'i1'},due:'2026-11-02'}});
 assert.equal(plan.status,'needs_review');
 assert.equal((await original.approve(plan.id)).status,'approved');
 await commands.createLedger(db).transition(plan.id,['approved'],{type:'executing'},{status:'executing'});
 const guard=commands.resolve({commandId:'invoice.followup.schedule',params:plan.params},
  await snapshot(db),{businessId,today:'2026-10-29'}).guard;
 const saved=await core.execute({db,kind:'invoice.followup.schedule',
  payload:{invoiceId:'i1',due:'2026-11-02'},uid:()=> 'saved-invoice-task',
  requestKey:'operation:'+plan.id,actor:'local-owner',businessId,approved:true,recordGuard:guard});
 const afterReload=make(),recovered=await afterReload.reconcile(plan.id);
 assert.equal(recovered.status,'succeeded');
 assert.equal(recovered.result.id,saved.id);
 assert.equal(recovered.result.reconciled,true);
 assert.equal((await afterReload.execute(plan.id)).reused,true);
 assert.equal(executions,0);
 assert.equal((await snapshot(db)).tasks.length,1);
});
test('invoice recovery cannot report success without durable task and event evidence',async()=>{
 const f=fixture(),db=f.db;let n=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),
  context:()=>({actor:'local-owner',businessId,today:'2026-10-29'}),
  uid:()=> 'missing-'+(++n),ledger:commands.createLedger(db),
  can:p=>p==='modify:invoice.followup.schedule'});
 const plan=await runtime.prepare({commandId:'invoice.followup.schedule',
  params:{ref:{store:'invoices',id:'i1'},due:'2026-11-02'}});
 await runtime.approve(plan.id);
 await commands.createLedger(db).transition(plan.id,['approved'],{type:'executing'},{status:'executing'});
 const before=await snapshot(db),missing=await runtime.reconcile(plan.id);
 assert.equal(missing.status,'indeterminate');assert.equal(missing.error.code,'RECEIPT_MISSING');
 assert.deepEqual(await snapshot(db),before);
});
test('partially paid invoice retains recorded balance and explicit approval guard',()=>{
 const partial={id:'p1',invoiceId:'i1',customerId:'c1',amount:50,currency:'USD'};
 const data={invoices:[invoice],customers:[{id:'c1',name:'Pilot customer',businessId}],payments:[partial]};
 const found=commands.resolve({commandId:'invoice.followup.schedule',
  params:{ref:{store:'invoices',id:'i1'},due:'2026-11-02'}},data,{businessId,today:'2026-10-29'});
 assert.equal(found.status,'needs_review');assert.equal(found.result.recordedOutstanding,150);
 assert.ok(found.guard.some(x=>Array.isArray(x.invoicePayments)&&x.invoicePayments[0].id==='p1'));
});
