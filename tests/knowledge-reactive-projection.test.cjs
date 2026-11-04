'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const events=require('../public/business-events.js');
const intelligence=require('../public/operational-intelligence.js');
const commands=require('../public/command-registry.js');
let localEvidence,projectLocalLaborSourceChange,LABOR_PROJECTION_KIND;
const businessId='local-business';
const scope={mode:'local',actor:'local-owner',businessId};
const today='2026-11-04',asOf='2026-11-04T09:15:00.000Z';
const cost=(id,type,laborHours)=>({
 id,businessId,jobId:'job_01',category:'Labor',type,laborHours
});
const planned=()=>cost('planned_01','estimate',20);
const actual=(n=25)=>cost('actual_01','actual',n);
const job=()=>({id:'job_01',businessId,title:'Synthetic electrical service job',status:'In Progress'});
const engine=intelligence.createEngine({commands,
 calendar:{conflicts:()=>[]},
 revenue:{totals:()=>({total:0}),collected:()=>0}
});
const event=(record=actual(),key='commit_01')=>events.make({
 store:'jobCosts',record,previous:record,key,
 context:{businessId,actor:'local-owner'},at:'2026-11-04T09:00:00Z'
});
const context=async({labor=25,includeActual=true,includeJob=true}={})=>
 localEvidence({jobs:includeJob?[job()]:[],
  jobCosts:[planned(),...(includeActual?[actual(labor)]:[])]},scope);
before(async()=>{
 ({localEvidence}=await import('../public/intelligence-evidence.js'));
 ({projectLocalLaborSourceChange,LABOR_PROJECTION_KIND}=
  await import('../public/knowledge-reactive-projection.js'));
});
const project=async(change,opts={})=>
 projectLocalLaborSourceChange({event:change,context:await context(),
  scope,engine,asOf,today,...opts});

test('committed local job-cost event creates one source-bound existing labor observation, no action',async()=>{
 const e=event(),original=await context();
 const result=await project(e,{context:original});
 assert.equal(result.kind,LABOR_PROJECTION_KIND);
 assert.equal(result.status,'candidate_finding');
 assert.equal(result.businessId,businessId);
 assert.equal(result.jobId,'job_01');
 assert.equal(result.correlationId,e.correlationId);
 assert.equal(result.finding.detectorId,'job.labor_hours_variance_review');
 assert.equal(result.finding.estimatedLaborHours,20);
 assert.equal(result.finding.recordedLaborHours,25);
 assert.equal(result.finding.differenceHours,5);
 assert.equal(result.finding.timesheetVerified,false);
 assert.equal(result.finding.payrollVerified,false);
 assert.equal(result.finding.profitVerified,false);
 assert.equal(result.finding.proposedAction,null);
 assert.match(result.sourceBinding,/^[a-f0-9]{64}$/);
 assert.ok(result.sources.some(p=>p.recordType==='jobs'&&p.recordId==='job_01'));
 assert.equal(result.sources.filter(p=>p.recordType==='jobCosts').length,2);
 assert.equal(result.modelCalls,0);
 assert.equal(result.readbackVerified,false);
 assert.equal(result.executionAuthority,false);
 assert.equal(result.evidenceMode,'device_local_only');
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.finding));
 assert.equal(original.records.find(r=>r.type==='jobCosts').revision,null);
});

test('same current source returns unchanged after duplicate event replay',async()=>{
 const first=await project(event());
 const retry=await project(event(),{previous:first});
 assert.equal(retry.status,'unchanged');
 assert.equal(retry.sourceBinding,first.sourceBinding);
 assert.equal(retry.invalidatedPrevious,false);
 assert.equal(retry.modelCalls,0);
 const later=await project(event(actual(),'another_commit'),{previous:first});
 assert.equal(later.status,'unchanged','a later duplicate source does not create a second finding');
});

test('corrected labor evidence invalidates the old candidate, without claiming resolved work',async()=>{
 const first=await project(event());
 const fixed=await context({labor:19});
 const result=await project(event(actual(19),'fix_commit'),{
  context:fixed,previous:first
 });
 assert.equal(result.status,'no_current_recorded_overrun');
 assert.equal(result.finding,null);
 assert.equal(result.invalidatedPrevious,true);
 assert.notEqual(result.sourceBinding,first.sourceBinding);
 assert.equal(result.executionAuthority,false);
 assert.equal(result.readbackVerified,false);
});

test('replayed event with changed source cannot silently refresh a newer finding',async()=>{
 const e=event(),first=await project(e);
 const modified=await context({labor:19});
 const again=await project(e,{context:modified,previous:first});
 assert.equal(again.status,'replayed_event_against_changed_source');
 assert.equal(again.finding,null);
 assert.equal(again.requiresFreshEvent,true);
 assert.equal(again.invalidatedPrevious,true);
});

test('deleted or withheld touched cost/job does not establish absence of an overrun',async()=>{
 const first=await project(event());
 for(const unavailable of [
  await context({includeActual:false}),
  await context({includeJob:false})
 ]){
  const outcome=await project(event(),{context:unavailable,previous:first});
  assert.equal(outcome.status,'source_unavailable_or_withheld');
  assert.equal(outcome.finding,null);
  assert.equal(outcome.invalidatedPrevious,true);
 }
});

test('foreign scope, uncommitted input and wrong event family are denied before evaluation',async()=>{
 const e=event();
 for(const altered of [
  {...e,businessId:'foreign_business'},
  {...e,actor:'foreign_actor'},
  {...e,evidence:'unverified_remote'},
  {...e,status:'failed'},
  {...e,ref:{store:'invoices',id:'actual_01'}},
  {...e,type:'invoice.updated'}
 ]){
  await assert.rejects(project(altered),/Current locally committed/);
 }
 await assert.rejects(project(e,{scope:{...scope,actor:'other'}}),/Current locally committed/);
 await assert.rejects(project(e,{scope:{...scope,mode:'cloud'}}),/Current locally committed/);
});

test('private or altered evidence is rejected rather than silently recomputed',async()=>{
 const invalid=await context();
 invalid.records.find(x=>x.type==='jobs').record.secretMargin=999;
 await assert.rejects(project(event(),{context:invalid}),/unapproved fields/);
 const scopeChanged=await context();
 await assert.rejects(project(event(),{context:scopeChanged,previous:{
  kind:LABOR_PROJECTION_KIND,businessId:'foreign_business',scopeBinding:'other'
 }}),/Previous finding/);
});

test('a missing/unregistered detector does not masquerade as no overrun',async()=>{
 const e=event();
 await assert.rejects(project(e,{engine:{evaluate:()=>({findings:[]}),detectorIds:[]}}),
  /Current locally committed/);
 const fake={detectorIds:['job.labor_hours_variance_review'],
  evaluate:()=>({version:1,findings:[],coverage:{detectors:[]}})};
 const missing=await project(e,{engine:fake});
 assert.equal(missing.status,'detector_unavailable');
 assert.equal(missing.finding,null);
 assert.equal(missing.modelCalls,0);
});

test('same actor/job source cannot reuse a previous projection from another contract',async()=>{
 const prev=await project(event());
 await assert.rejects(project(event(),{
  previous:{...prev,kind:'tradeflow.other.kind'}
 }),/Previous finding/);
});
