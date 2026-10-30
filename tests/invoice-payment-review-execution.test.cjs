'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const commands=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const invoice={id:'i1',customerId:'c1',businessId,status:'Issued',currency:'USD',taxRate:0,lines:[{qty:1,unitPrice:100}]};
const payment={id:'p1',invoiceId:'i1',customerId:'c1',currency:'USD',amount:150,businessId};
const command={commandId:'invoice.payment_review.schedule',params:{ref:{store:'invoices',id:'i1'},due:'2026-11-03'}};
function fixture(){
 const db=createDB({invoices:[invoice],customers:[{id:'c1',name:'Customer',businessId}],payments:[payment]});
 let n=0,calls=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-30'}),
  uid:()=>`cmd-${++n}`,ledger:commands.createLedger(db),can:p=>p==='modify:invoice.payment_review.schedule',
  ports:{operation:async(kind,payload,proof)=>{calls++;return core.execute({db,kind,payload,uid:()=>`task-${n}`,
   requestKey:proof.requestKey,recordGuard:proof.recordGuard,actor:proof.actor,businessId:proof.businessId,approved:proof.approved})}}});
 return {db,runtime,calls:()=>calls};
}
test('approved local overpayment creates an internal task and audit without changing payments',async()=>{
 const {db,runtime}=fixture();const p=await runtime.prepare(command);
 assert.equal(p.status,'needs_review');assert.equal(p.result.invoiceTotal,100);assert.equal(p.result.recordedPayments,150);
 assert.equal(p.result.externalAccountingVerified,false);assert.equal((await runtime.execute(p.id)).error.code,'APPROVAL_REQUIRED');
 await runtime.approve(p.id);assert.equal((await runtime.execute(p.id)).status,'succeeded');
 const data=await snapshot(db),task=data.tasks[0];
 assert.equal(task.taskKind,'invoice_payment_reconciliation');assert.equal(task.paymentEvidence.discrepancy,50);
 assert.deepEqual(task.paymentEvidence.paymentIds,['p1']);assert.equal(task.paymentEvidence.settlementVerified,false);
 assert.equal(task.paymentEvidence.externalAccountingVerified,false);assert.equal(data.payments[0].amount,150);
 assert.equal(data.commandLog.filter(x=>x.kind==='invoice.payment_review.schedule').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='task.created').length,1);
});
test('stale invoice, payment and existing reconciliation task prevent execution',async()=>{
 for(const type of ['invoice','payment','task']){
  const {db,runtime}=fixture();const p=await runtime.prepare(command);await runtime.approve(p.id);
  if(type==='invoice')await put(db,'invoices',{...invoice,reference:'changed'});
  if(type==='payment')await put(db,'payments',{...payment,amount:160});
  if(type==='task')await put(db,'tasks',{id:'other',invoiceId:'i1',businessId,taskKind:'invoice_payment_reconciliation',status:'Open'});
  assert.equal((await runtime.execute(p.id)).status,'stale',type);
  assert.equal((await snapshot(db)).tasks.some(x=>x.id.startsWith('task-')),false);
 }
});
test('rejected approval, corrected balance and mismatched tenant evidence fail closed',async()=>{
 const {db,runtime}=fixture();const p=await runtime.prepare(command);
 assert.equal((await runtime.reject(p.id)).status,'rejected');assert.equal((await snapshot(db)).tasks.length,0);
 await put(db,'payments',{...payment,amount:100});assert.equal((await runtime.prepare(command)).error.code,'NO_RECORDED_OVERPAYMENT');
 await put(db,'payments',{...payment,businessId:'foreign'});
 assert.equal((await runtime.prepare(command)).error.code,'PAYMENT_EVIDENCE_INCOMPLETE');
});
test('recovery requires matching receipt and task; later approvals reuse the open task',async()=>{
 const {db,runtime,calls}=fixture();const p=await runtime.prepare(command);await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'},{status:'executing'});
 const resolved=commands.resolve(command,await snapshot(db),{actor:'local-owner',businessId});
 await core.execute({db,kind:'invoice.payment_review.schedule',payload:{invoiceId:'i1',due:'2026-11-03',invoiceTotal:100,recordedPayments:150},
  uid:()=> 'saved-task',requestKey:'operation:'+p.id,actor:'local-owner',businessId,approved:true,recordGuard:resolved.guard});
 assert.equal((await runtime.reconcile(p.id)).status,'succeeded');assert.equal(calls(),0);
 const another=await runtime.prepare(command);await runtime.approve(another.id);
 assert.equal((await runtime.execute(another.id)).result.reused,true);
 assert.equal((await snapshot(db)).tasks.length,1);
});
test('invoice UI exposes a permissioned review and labels unverified settlement',()=>{
 const app=fs.readFileSync('public/app.js','utf8');assert.match(app,/data-action="tfInvoicePaymentReview"/);
 assert.match(app,/commandId:'invoice.payment_review.schedule'/);assert.match(app,/NOT verified bank settlements/);
});
