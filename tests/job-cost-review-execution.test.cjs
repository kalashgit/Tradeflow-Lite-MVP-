'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const commands=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const job={id:'j1',title:'Panel replacement',customerId:'c1',businessId,status:'In Progress'};
const costs=[{id:'budget',jobId:'j1',type:'estimate',amount:1000,businessId},{id:'labor',jobId:'j1',type:'actual',amount:850,businessId}];
const expenses=[{id:'fuel',jobId:'j1',amount:200,businessId}];
const command={commandId:'job.cost_review.schedule',params:{ref:{store:'jobs',id:'j1'},due:'2026-11-03'}};
function fixture(){
 const db=createDB({jobs:[job],customers:[{id:'c1',name:'Customer',businessId}],jobCosts:costs,expenses});
 let n=0,calls=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-30'}),
  uid:()=>`cmd-${++n}`,ledger:commands.createLedger(db),can:p=>p==='modify:job.cost_review.schedule',
  ports:{operation:async(kind,payload,proof)=>{calls++;return core.execute({db,kind,payload,uid:()=>`task-${n}`,
   requestKey:proof.requestKey,recordGuard:proof.recordGuard,actor:proof.actor,businessId:proof.businessId,approved:proof.approved})}}});
 return {db,runtime,calls:()=>calls};
}
test('owner-reviewed overrun creates one internal task, durable receipt and explicitly unverified financial evidence',async()=>{
 const {db,runtime}=fixture();const p=await runtime.prepare(command);
 assert.equal(p.status,'needs_review');assert.equal(p.result.budget,1000);assert.equal(p.result.recordedCosts,1050);
 assert.equal(p.result.profitVerified,false);assert.equal((await runtime.execute(p.id)).error.code,'APPROVAL_REQUIRED');
 assert.equal((await runtime.approve(p.id)).status,'approved');assert.equal((await runtime.execute(p.id)).status,'succeeded');
 const data=await snapshot(db),task=data.tasks[0];
 assert.equal(task.taskKind,'job_cost_reconciliation');assert.equal(task.financialEvidence.budget,1000);
 assert.equal(task.financialEvidence.recordedCosts,1050);assert.equal(task.financialEvidence.profitVerified,false);
 assert.equal(task.financialEvidence.externalAccountingVerified,false);
 assert.equal(task.financialEvidence.possibleOverlap,true);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='task.created').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='job.cost_review.schedule').length,1);
 assert.equal((await runtime.execute(p.id)).reused,true);
});
test('stale job cost, expense, customer and existing task fail closed',async()=>{
 for(const type of ['cost','expense','customer','task']){
  const {db,runtime}=fixture();const p=await runtime.prepare(command);await runtime.approve(p.id);
  if(type==='cost')await put(db,'jobCosts',{...costs[1],amount:900});
  if(type==='expense')await put(db,'expenses',{...expenses[0],amount:250});
  if(type==='customer')await put(db,'customers',{id:'c1',name:'Changed',businessId});
  if(type==='task')await put(db,'tasks',{id:'other-task',jobId:'j1',businessId,taskKind:'job_cost_reconciliation',status:'Open'});
  assert.equal((await runtime.execute(p.id)).status,'stale',type);
  assert.equal((await snapshot(db)).tasks.filter(t=>t.id.startsWith('task-')).length,0);
 }
});
test('incomplete costs, no overrun and rejected approval cannot produce task',async()=>{
 const {db,runtime}=fixture();const p=await runtime.prepare(command);
 assert.equal((await runtime.reject(p.id)).status,'rejected');
 assert.equal((await snapshot(db)).tasks.length,0);
 await put(db,'expenses',{...expenses[0],amount:-1});
 assert.equal((await runtime.prepare(command)).error.code,'COST_EVIDENCE_INCOMPLETE');
 await put(db,'expenses',{...expenses[0],amount:100});
 assert.equal((await runtime.prepare(command)).error.code,'NO_RECORDED_OVERRUN');
});
test('duplicate operation and interrupted receipt reconcile without replay',async()=>{
 const {db,runtime,calls}=fixture();const p=await runtime.prepare(command);await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'}, {status:'executing'});
 const resolved=commands.resolve(command,await snapshot(db),{actor:'local-owner',businessId});
 await core.execute({db,kind:'job.cost_review.schedule',payload:{jobId:'j1',due:'2026-11-03',budget:1000,recordedCosts:1050},
  uid:()=> 'saved-task',requestKey:'operation:'+p.id,actor:'local-owner',businessId,approved:true,recordGuard:resolved.guard});
 assert.equal((await runtime.reconcile(p.id)).status,'succeeded');assert.equal(calls(),0);
 assert.equal((await snapshot(db)).tasks.length,1);
 const another=await runtime.prepare(command);await runtime.approve(another.id);
 assert.equal((await runtime.execute(another.id)).result.reused,true);
 assert.equal((await snapshot(db)).tasks.length,1);
});
test('existing job UI and command permissions expose owner-reviewed cost reconciliation only',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/data-action="tfJobCostReview"/);
 assert.match(app,/commandId:'job.cost_review.schedule'/);
 assert.match(app,/Profit and settlement remain unverified/);
});
