'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const commands=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const job={id:'j1',title:'Panel replacement',customerId:'c1',businessId,status:'In Progress'};
const costs=[{id:'planned',jobId:'j1',category:'Labor',type:'estimate',laborHours:20,amount:800,businessId},
 {id:'recorded',jobId:'j1',category:'Labor',type:'actual',laborHours:25,amount:1000,businessId}];
const command={commandId:'job.labor_review.schedule',params:{ref:{store:'jobs',id:'j1'},due:'2026-11-03'}};
function fixture(){
 const db=createDB({jobs:[job],customers:[{id:'c1',name:'Customer',businessId}],jobCosts:costs});
 let n=0,calls=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-30'}),
  uid:()=>`cmd-${++n}`,ledger:commands.createLedger(db),can:p=>p==='modify:job.labor_review.schedule',
  ports:{operation:async(kind,payload,proof)=>{calls++;return core.execute({db,kind,payload,uid:()=>`task-${n}`,
   requestKey:proof.requestKey,recordGuard:proof.recordGuard,actor:proof.actor,businessId:proof.businessId,approved:proof.approved})}}});
 return {db,runtime,calls:()=>calls};
}
test('owner approval creates a manual-hours variance task, linked domain event and receipt',async()=>{
 const {db,runtime}=fixture();const p=await runtime.prepare(command);
 assert.equal(p.status,'needs_review');assert.equal(p.result.estimatedLaborHours,20);
 assert.equal(p.result.recordedLaborHours,25);assert.equal(p.result.timesheetVerified,false);
 assert.equal((await runtime.execute(p.id)).error.code,'APPROVAL_REQUIRED');
 await runtime.approve(p.id);assert.equal((await runtime.execute(p.id)).status,'succeeded');
 const data=await snapshot(db),task=data.tasks[0];
 assert.equal(task.taskKind,'job_labor_variance_review');assert.equal(task.laborEvidence.varianceHours,5);
 assert.deepEqual(task.laborEvidence.sourceCostIds,['planned','recorded']);
 assert.equal(task.laborEvidence.timesheetVerified,false);assert.equal(task.laborEvidence.payrollVerified,false);
 assert.equal(data.commandLog.filter(x=>x.kind==='job.labor_review.schedule').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='task.created').length,1);
 assert.equal((await runtime.execute(p.id)).reused,true);
});
test('stale labor entry, job, customer and competing review are rejected',async()=>{
 for(const type of ['hours','job','customer','task']){
  const {db,runtime}=fixture();const p=await runtime.prepare(command);await runtime.approve(p.id);
  if(type==='hours')await put(db,'jobCosts',{...costs[1],laborHours:30});
  if(type==='job')await put(db,'jobs',{...job,title:'Changed'});
  if(type==='customer')await put(db,'customers',{id:'c1',name:'Changed',businessId});
  if(type==='task')await put(db,'tasks',{id:'another',jobId:'j1',businessId,taskKind:'job_labor_variance_review',status:'Open'});
  assert.equal((await runtime.execute(p.id)).status,'stale',type);
  assert.equal((await snapshot(db)).tasks.some(t=>t.id.startsWith('task-')),false);
 }
});
test('invalid, corrected or cross-business labor evidence and rejected approval never execute',async()=>{
 const {db,runtime}=fixture();const p=await runtime.prepare(command);
 assert.equal((await runtime.reject(p.id)).status,'rejected');assert.equal((await snapshot(db)).tasks.length,0);
 await put(db,'jobCosts',{...costs[1],laborHours:19});
 assert.equal((await runtime.prepare(command)).error.code,'NO_LABOR_OVERRUN');
 await put(db,'jobCosts',{...costs[1],laborHours:25,businessId:'other-business'});
 assert.equal((await runtime.prepare(command)).error.code,'LABOR_EVIDENCE_INCOMPLETE');
});
test('interrupted operation reconciles by receipt without replay and prevents duplicate open review',async()=>{
 const {db,runtime,calls}=fixture();const p=await runtime.prepare(command);await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'},{status:'executing'});
 const resolved=commands.resolve(command,await snapshot(db),{actor:'local-owner',businessId});
 await core.execute({db,kind:'job.labor_review.schedule',payload:{jobId:'j1',due:'2026-11-03',estimatedLaborHours:20,recordedLaborHours:25},
  uid:()=> 'saved-task',requestKey:'operation:'+p.id,actor:'local-owner',businessId,approved:true,recordGuard:resolved.guard});
 assert.equal((await runtime.reconcile(p.id)).status,'succeeded');assert.equal(calls(),0);
 const another=await runtime.prepare(command);await runtime.approve(another.id);
 assert.equal((await runtime.execute(another.id)).result.reused,true);
 assert.equal((await snapshot(db)).tasks.length,1);
});
test('job dossier exposes the permissioned labor review and explicitly unverified evidence',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/data-action="tfJobLaborReview"/);assert.match(app,/commandId:'job.labor_review.schedule'/);
 assert.match(app,/NOT verified timesheets, payroll or billable hours/);
});
