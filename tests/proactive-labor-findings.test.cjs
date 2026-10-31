'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const events=require('../public/business-events.js');
const intelligence=require('../public/operational-intelligence.js');
const commands=require('../public/command-registry.js');
const {createDB,put,snapshot}=require('./helpers/local-db.cjs');
const ACTOR='local-owner',BUSINESS='local-business';
const costs=[
 {id:'planned',jobId:'j1',businessId:BUSINESS,category:'Labor',type:'estimate',laborHours:20,amount:800},
 {id:'actual',jobId:'j1',businessId:BUSINESS,category:'Labor',type:'actual',laborHours:25,amount:1000}
];
const job={id:'j1',businessId:BUSINESS,title:'Synthetic panel replacement',status:'In Progress'};
const context={actor:ACTOR,businessId:BUSINESS};
const engine=intelligence.createEngine({commands,calendar:{conflicts:()=>[]},revenue:{totals:()=>({total:0}),collected:()=>0}});
function report(extra={}){
 return engine.evaluate({jobs:[job],jobCosts:costs,customers:[],tasks:[],quotes:[],invoices:[],payments:[],...extra},
  {today:'2026-10-31',now:'2026-10-31T12:00:00.000Z',businessId:BUSINESS});
}
function host(result=report()){
 let prepares=0,executes=0;
 return {
  prepare:async({commandId})=>{prepares++;assert.equal(commandId,'intelligence.review');return {id:'read-only-plan',status:'ready'}},
  execute:async()=>{executes++;return {status:'succeeded',result}},
  calls:()=>({prepares,executes})
 };
}
async function fixture(){
 const db=createDB({jobs:[job],jobCosts:costs});
 const event=events.make({store:'jobCosts',record:costs[1],previous:costs[1],key:'cost_update_1',context,at:'2026-10-31T12:00:00Z'});
 await put(db,'commandLog',event);
 return {db,event};
}
test('automatic read-only domain event persists TF-P06 finding evidence, then reload preserves it without creating task',async()=>{
 const {db}=await fixture(),ports=host();
 const r=await events.drain({db,events:(await snapshot(db)).commandLog,commands:ports,businessId:BUSINESS});
 assert.equal(r.processed,1);
 const after=await snapshot(db),item=after.commandLog.find(x=>x.kind==='domain.event');
 assert.equal(item.status,'processed');
 assert.equal(item.result.laborFindings.length,1);
 assert.equal(item.result.laborFindings[0].jobId,'j1');
 assert.equal(item.result.laborFindings[0].estimatedLaborHours,20);
 assert.equal(item.result.laborFindings[0].recordedLaborHours,25);
 assert.equal(item.result.laborFindings[0].varianceHours,5);
 assert.equal(item.result.laborFindings[0].timesheetVerified,false);
 assert.equal(item.result.laborFindings[0].payrollVerified,false);
 assert.equal(item.result.laborFindings[0].executionAuthority,false);
 assert.equal(item.result.laborFindings[0].proposedCommandId,'job.labor_review.schedule');
 assert.equal(after.tasks.length,0);
 assert.equal(after.commandLog.filter(x=>x.kind==='pilot.command'&&x.commandId==='job.labor_review.schedule').length,0);
 const replay=await events.drain({db,events:after.commandLog,commands:ports,businessId:BUSINESS});
 assert.equal(replay.processed,0);assert.deepEqual(ports.calls(),{prepares:1,executes:1});
 assert.deepEqual((await snapshot(db)).commandLog.find(x=>x.kind==='domain.event').result,item.result);
});
test('wrong-tenant events are excluded and suspended rule leaves no persisted proactive finding',async()=>{
 const {db,event}=await fixture(),ports=host();
 const foreign={...event,id:'domain:foreign:jobCosts:actual',businessId:'other-business'};
 await put(db,'commandLog',foreign);
 assert.equal((await events.drain({db,events:[foreign],commands:ports,businessId:BUSINESS})).processed,0);
 assert.equal((await events.drain({db,events:[event],commands:ports,businessId:BUSINESS,rule:{id:'operational-review',effect:'read',enabled:false}})).status,'suspended');
 assert.deepEqual(ports.calls(),{prepares:0,executes:0});
 assert.equal((await snapshot(db)).tasks.length,0);
});
test('corrected labor, invalid evidence and blocked signals cannot persist an actionable overrun',async()=>{
 const fixed=report({jobCosts:[costs[0],{...costs[1],laborHours:19}]});
 assert.deepEqual(events.laborFindingSummaries(fixed.findings).items,[]);
 const base=report().findings.find(x=>x.detectorId==='job.labor_hours_variance_review');
 assert.ok(base,'existing deterministic detector is required');
 for(const item of [
  {...base,status:'blocked'},
  {...base,evidence:{estimatedLaborHours:0,recordedLaborHours:25}},
  {...base,evidence:{estimatedLaborHours:20,recordedLaborHours:NaN}},
  {...base,recordRefs:[{store:'jobs',id:'j1'},{store:'jobs',id:'j2'}]},
  {...base,recordRefs:[{store:'jobs',id:'../../other'}]}
 ])assert.equal(events.laborFindingSummaries([item]).items.length,0);
});
test('summaries are bounded, deterministic and never carry arbitrary source payload, secrets or customer text',()=>{
 const original=report().findings.find(x=>x.detectorId==='job.labor_hours_variance_review');
 const items=Array.from({length:30},(_,i)=>({...original,id:'finding_'+i,recordRefs:[{store:'jobs',id:'j'+String(i).padStart(2,'0')}],
  explanation:'PRIVATE CUSTOMER',evidence:{...original.evidence,token:'SECRET'}}));
 const result=events.laborFindingSummaries(items);
 assert.equal(result.items.length,20);assert.equal(result.truncated,true);
 assert.ok(result.items.every(x=>x.executionAuthority===false&&!JSON.stringify(x).includes('PRIVATE')&&!JSON.stringify(x).includes('SECRET')));
 assert.deepEqual(events.laborFindingSummaries([...items].reverse()),result);
});
test('review rejection does not create false processed evidence',async()=>{
 const {db}=await fixture();
 const ports={prepare:async()=>({status:'failed',error:{message:'Unauthorized'}}),execute:async()=>{throw Error('must not execute')}};
 await events.drain({db,events:(await snapshot(db)).commandLog,commands:ports,businessId:BUSINESS});
 const event=(await snapshot(db)).commandLog.find(x=>x.kind==='domain.event');
 assert.equal(event.status,'pending');assert.equal(event.result?.laborFindings,undefined);
 assert.equal((await snapshot(db)).tasks.length,0);
});
test('existing dossier displays persisted attention only alongside the shared explanation and approval UI',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/tfSavedProactiveLaborFinding/);
 assert.match(app,/data-proactive-labor-finding/);
 assert.match(app,/data-action="tfDecisionExplain"/);
 assert.match(app,/NOT verified timesheets, payroll or billable hours/);
});
