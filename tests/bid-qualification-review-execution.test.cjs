'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const commands=require('../public/command-registry.js'),core=require('../public/core-integration.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const businessId='local-business';
const opportunity={id:'o1',project_name:'Factory electrical',status:'Interested',bid_decision:'Pursue',
 bidInvitationVerified:'Unknown',bidScopeReviewed:'Yes',bidCapacityChecked:'No',businessId};
const command={commandId:'opportunity.bid_review.schedule',params:{ref:{store:'opportunities',id:'o1'},due:'2026-11-03'}};
function fixture(){
 const db=createDB({opportunities:[opportunity]});let n=0,calls=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),context:()=>({actor:'local-owner',businessId,today:'2026-10-30'}),
  uid:()=>`cmd-${++n}`,ledger:commands.createLedger(db),can:p=>p==='modify:opportunity.bid_review.schedule',
  ports:{operation:async(kind,payload,proof)=>{calls++;return core.execute({db,kind,payload,uid:()=>`task-${n}`,
   requestKey:proof.requestKey,recordGuard:proof.recordGuard,actor:proof.actor,businessId:proof.businessId,approved:proof.approved})}}});
 return {db,runtime,calls:()=>calls};
}
test('approved incomplete bid creates one internal qualification task and audit only',async()=>{
 const {db,runtime}=fixture(),plan=await runtime.prepare(command);
 assert.equal(plan.status,'needs_review');assert.equal(plan.result.invitation,'Unknown');
 assert.equal(plan.result.capacity,'No');assert.equal(plan.result.independentlyVerified,false);
 assert.equal((await runtime.execute(plan.id)).error.code,'APPROVAL_REQUIRED');
 await runtime.approve(plan.id);assert.equal((await runtime.execute(plan.id)).status,'succeeded');
 const data=await snapshot(db),task=data.tasks[0];
 assert.equal(task.taskKind,'bid_qualification_review');assert.equal(task.qualificationEvidence.bidSubmitted,false);
 assert.equal(task.qualificationEvidence.independentlyVerified,false);
 assert.equal(data.opportunities[0].bid_decision,'Pursue');
 assert.equal(data.commandLog.filter(x=>x.kind==='opportunity.bid_review.schedule').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='task.created').length,1);
});
test('stale opportunity or competing open task blocks write',async()=>{
 for(const type of ['opportunity','task']){
  const {db,runtime}=fixture(),p=await runtime.prepare(command);await runtime.approve(p.id);
  if(type==='opportunity')await put(db,'opportunities',{...opportunity,bidCapacityChecked:'Yes'});
  else await put(db,'tasks',{id:'another',opportunityId:'o1',taskKind:'bid_qualification_review',status:'Open',businessId});
  assert.equal((await runtime.execute(p.id)).status,'stale',type);
  assert.equal((await snapshot(db)).tasks.some(x=>x.id.startsWith('task-')),false);
 }
});
test('rejection, completed readiness, withdrawn bids and tenant mismatches prevent execution',async()=>{
 const {db,runtime}=fixture(),p=await runtime.prepare(command);
 assert.equal((await runtime.reject(p.id)).status,'rejected');assert.equal((await snapshot(db)).tasks.length,0);
 await put(db,'opportunities',{...opportunity,bidInvitationVerified:'Yes',bidCapacityChecked:'Yes'});
 assert.equal((await runtime.prepare(command)).error.code,'CHECKS_COMPLETE');
 await put(db,'opportunities',{...opportunity,bid_decision:'Decline'});
 assert.equal((await runtime.prepare(command)).error.code,'NOT_ACTIVE_BID');
 await put(db,'opportunities',{...opportunity,businessId:'other-business'});
 assert.notEqual((await runtime.prepare(command)).status,'needs_review');
});
test('interrupted execution reconciles receipt without replay; later approval reuses task',async()=>{
 const {db,runtime,calls}=fixture(),p=await runtime.prepare(command);await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'},{status:'executing'});
 const resolved=commands.resolve(command,await snapshot(db),{actor:'local-owner',businessId});
 await core.execute({db,kind:'opportunity.bid_review.schedule',payload:{opportunityId:'o1',due:'2026-11-03',
  invitation:'Unknown',scope:'Yes',capacity:'No'},uid:()=> 'saved-task',requestKey:'operation:'+p.id,
  actor:'local-owner',businessId,approved:true,recordGuard:resolved.guard});
 assert.equal((await runtime.reconcile(p.id)).status,'succeeded');assert.equal(calls(),0);
 const another=await runtime.prepare(command);await runtime.approve(another.id);
 assert.equal((await runtime.execute(another.id)).result.reused,true);
 assert.equal((await snapshot(db)).tasks.length,1);
});
test('existing opportunity dossier exposes owner review without claiming submitted bid',()=>{
 const app=fs.readFileSync('public/app.js','utf8'),dossier=fs.readFileSync('public/opportunity-dossier.js','utf8');
 assert.match(app,/commandId:'opportunity.bid_review.schedule'/);
 assert.match(dossier,/data-action="tfBidQualificationReview"/);
 assert.match(app,/No bid is submitted or external message sent/);
});
