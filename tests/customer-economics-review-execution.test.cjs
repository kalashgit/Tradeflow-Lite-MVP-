'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const commands=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const customer={id:'c1',name:'Electrical client',businessId};
const job={id:'j1',customerId:'c1',businessId,status:'In Progress'};
const invoice={id:'i1',customerId:'c1',jobId:'j1',status:'Issued',businessId};
const payment={id:'p1',customerId:'c1',invoiceId:'i1',amount:750,businessId};
const cost={id:'k1',jobId:'j1',type:'actual',amount:250,businessId};
const expense={id:'e1',jobId:'j1',amount:150,businessId};
const command={commandId:'customer.economics_review.schedule',params:{ref:{store:'customers',id:'c1'},due:'2026-11-03'}};
function fixture(){
 const db=createDB({customers:[customer],jobs:[job],invoices:[invoice],payments:[payment],jobCosts:[cost],expenses:[expense]});
 let n=0,calls=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-30'}),
  uid:()=>`cmd-${++n}`,ledger:commands.createLedger(db),can:p=>p==='modify:customer.economics_review.schedule',
  ports:{operation:async(kind,payload,proof)=>{calls++;return core.execute({db,kind,payload,uid:()=>`task-${n}`,
   requestKey:proof.requestKey,recordGuard:proof.recordGuard,actor:proof.actor,businessId:proof.businessId,approved:proof.approved})}}});
 return {db,runtime,calls:()=>calls};
}
test('approved account review saves linked local contribution and audit, without profit claim',async()=>{
 const {db,runtime}=fixture(),p=await runtime.prepare(command);
 assert.equal(p.status,'needs_review');assert.equal(p.result.received,750);
 assert.equal(p.result.recordedCosts,400);assert.equal(p.result.recordedContribution,350);
 assert.equal((await runtime.execute(p.id)).error.code,'APPROVAL_REQUIRED');
 await runtime.approve(p.id);assert.equal((await runtime.execute(p.id)).status,'succeeded');
 const data=await snapshot(db),task=data.tasks[0];
 assert.equal(task.taskKind,'customer_economics_review');assert.equal(task.economicsEvidence.recordedContribution,350);
 assert.equal(task.economicsEvidence.profitVerified,false);assert.equal(task.economicsEvidence.bankSettlementVerified,false);
 assert.equal(task.economicsEvidence.externalAccountingVerified,false);
 assert.deepEqual(task.economicsEvidence.paymentIds,['p1']);
 assert.equal(data.payments[0].amount,750);assert.equal(data.commandLog.filter(x=>x.kind==='customer.economics_review.schedule').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='task.created').length,1);
});
test('changed customer, job, payment, cost, expense, invoice or competing task fail closed',async()=>{
 for(const type of ['customer','job','payment','cost','expense','invoice','task']){
  const {db,runtime}=fixture(),p=await runtime.prepare(command);await runtime.approve(p.id);
  if(type==='customer')await put(db,'customers',{...customer,name:'Changed'});
  if(type==='job')await put(db,'jobs',{...job,status:'Completed'});
  if(type==='payment')await put(db,'payments',{...payment,amount:800});
  if(type==='cost')await put(db,'jobCosts',{...cost,amount:300});
  if(type==='expense')await put(db,'expenses',{...expense,amount:200});
  if(type==='invoice')await put(db,'invoices',{...invoice,status:'Void'});
  if(type==='task')await put(db,'tasks',{id:'other',customerId:'c1',taskKind:'customer_economics_review',status:'Open',businessId});
  assert.equal((await runtime.execute(p.id)).status,'stale',type);
  assert.equal((await snapshot(db)).tasks.some(x=>x.id.startsWith('task-')),false);
 }
});
test('rejected approval and invalid or foreign financial evidence cannot schedule review',async()=>{
 const {db,runtime}=fixture(),p=await runtime.prepare(command);
 assert.equal((await runtime.reject(p.id)).status,'rejected');assert.equal((await snapshot(db)).tasks.length,0);
 await put(db,'expenses',{...expense,currency:'EUR'});
 assert.equal((await runtime.prepare(command)).error.code,'ECONOMICS_EVIDENCE_INCOMPLETE');
 await put(db,'expenses',{...expense,businessId:'foreign'});
 assert.equal((await runtime.prepare(command)).error.code,'ECONOMICS_EVIDENCE_INCOMPLETE');
});
test('interrupted review reconciles a receipt without replay, repeated approval reuses open task',async()=>{
 const {db,runtime,calls}=fixture(),p=await runtime.prepare(command);await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'},{status:'executing'});
 const resolved=commands.resolve(command,await snapshot(db),{actor:'local-owner',businessId});
 await core.execute({db,kind:'customer.economics_review.schedule',payload:{customerId:'c1',due:'2026-11-03',received:750,recordedCosts:400},
  uid:()=> 'saved-task',requestKey:'operation:'+p.id,actor:'local-owner',businessId,approved:true,recordGuard:resolved.guard});
 assert.equal((await runtime.reconcile(p.id)).status,'succeeded');assert.equal(calls(),0);
 const another=await runtime.prepare(command);await runtime.approve(another.id);
 assert.equal((await runtime.execute(another.id)).result.reused,true);
 assert.equal((await snapshot(db)).tasks.length,1);
});
test('customer dossier exposes owner review and explicit limits on profit certainty',()=>{
 const app=fs.readFileSync('public/app.js','utf8');assert.match(app,/data-action="tfCustomerEconomicsReview"/);
 assert.match(app,/commandId:'customer.economics_review.schedule'/);
 assert.match(app,/NOT verified customer profit, bank settlement or lifetime value/);
});
