'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const events=require('../public/business-events.js'),intel=require('../public/operational-intelligence.js'),commands=require('../public/command-registry.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
const scope={actor:'local-owner',businessId:'local-business'};
const job={id:'j1',title:'Synthetic panel service',status:'In Progress',businessId:'local-business'};
const planned={id:'est',jobId:'j1',businessId:'local-business',category:'Labor',type:'estimate',laborHours:20,amount:700};
const actual={id:'act',jobId:'j1',businessId:'local-business',category:'Labor',type:'actual',laborHours:25,amount:880};
const engine=intel.createEngine({commands,calendar:{conflicts:()=>[]},revenue:{totals:()=>({total:0}),collected:()=>0},detectors:[...intel.builtinDetectors,...intel.optimizationDetectors]});
function review(data){return engine.evaluate(data,{businessId:'local-business',today:'2026-11-03',now:'2026-11-03T12:00:00Z'})}
function ports(db){let n=0;return {prepare:async input=>({id:'read_'+(++n),status:input.commandId==='intelligence.review'?'ready':'rejected'}),
 execute:async()=>({status:'succeeded',result:review(await snapshot(db))}),calls:()=>n}}
async function fixture(cost=actual){
 const db=createDB({jobs:[job],jobCosts:[planned,cost]});
 const event=events.make({store:'jobCosts',record:cost,previous:cost,key:'change_1',context:scope,at:'2026-11-03T11:00:00Z'});
 await put(db,'commandLog',event);
 return {db,event,ports:ports(db)};
}
test('real committed cost event builds a derived case with existing labor finding, zero business writes',async()=>{
 const f=await fixture();await events.drain({db:f.db,events:[f.event],commands:f.ports});
 const data=await snapshot(f.db),row=data.commandLog.find(e=>e.kind==='domain.event'),c=row.result.reactiveLaborCase;
 assert.equal(row.status,'processed');assert.equal(c.kind,'tradeflow.intelligence.reactive-labor-case.v1');
 assert.equal(c.status,'owner_review_available');assert.equal(c.estimatedLaborHours,20);assert.equal(c.recordedLaborHours,25);
 assert.equal(c.proposedCommandId,'job.labor_review.schedule');assert.equal(c.executionAuthority,false);
 assert.equal(c.timesheetVerified,false);assert.equal(c.payrollVerified,false);assert.equal(c.sourceMode,'device_local_unverified');
 assert.equal(events.inspectReactiveLaborCase({event:row,records:data}).status,'current');
 assert.equal(data.tasks.length,0);
 await events.drain({db:f.db,events:[row],commands:f.ports});
 assert.equal(f.ports.calls(),1);
});
test('source changes invalidate the saved derived case even when aggregate hours stay identical',async()=>{
 const f=await fixture();await events.drain({db:f.db,events:[f.event],commands:f.ports});
 const row=(await snapshot(f.db)).commandLog.find(x=>x.kind==='domain.event');
 await put(f.db,'jobCosts',{...actual,id:'act-new'});
 const current=await snapshot(f.db);current.jobCosts=current.jobCosts.filter(x=>x.id!=='act');
 assert.equal(events.inspectReactiveLaborCase({event:row,records:current}).status,'source_unavailable');
 const revised=await snapshot(f.db);revised.jobCosts=revised.jobCosts.map(x=>x.id==='act'?{...x,revision:2}:x);
 assert.equal(events.inspectReactiveLaborCase({event:row,records:revised}).status,'stale_source');
});
test('changed job or foreign business cannot reuse the recorded event finding',async()=>{
 const f=await fixture();await events.drain({db:f.db,events:[f.event],commands:f.ports});
 const data=await snapshot(f.db),row=data.commandLog.find(e=>e.kind==='domain.event');
 data.jobs[0].status='Completed';
 assert.equal(events.inspectReactiveLaborCase({event:row,records:data}).status,'stale_source');
 assert.equal(events.inspectReactiveLaborCase({event:row,records:data,businessId:'other'}).status,'access_or_event_unverified');
 assert.equal(events.inspectReactiveLaborCase({event:row,records:data,actor:'crew_1'}).status,'access_or_event_unverified');
});
test('corrected manually recorded hours are an observation, not a claimed verified outcome',async()=>{
 const f=await fixture({...actual,laborHours:19});await events.drain({db:f.db,events:[f.event],commands:f.ports});
 const data=await snapshot(f.db),row=data.commandLog.find(e=>e.kind==='domain.event'),c=row.result.reactiveLaborCase;
 assert.equal(c.status,'no_recorded_overrun');assert.equal(c.findingId,null);assert.equal(c.outcomeVerified,false);
 assert.equal(events.inspectReactiveLaborCase({event:row,records:data}).reviewStatus,'no_recorded_overrun');
});
test('missing or contradictory source fails closed and does not create a case',async()=>{
 const f=await fixture();await put(f.db,'jobCosts',{...actual,businessId:'foreign-business'});
 await events.drain({db:f.db,events:[f.event],commands:f.ports});
 const row=(await snapshot(f.db)).commandLog.find(e=>e.kind==='domain.event');
 assert.equal(row.result.reactiveLaborCase,undefined);
 assert.equal(events.inspectReactiveLaborCase({event:row,records:await snapshot(f.db)}).status,'case_unavailable');
});
test('non-job events do not create fake labor cases and pending offline events are not current',async()=>{
 const f=await fixture();assert.equal(events.inspectReactiveLaborCase({event:f.event,records:await snapshot(f.db)}).status,'access_or_event_unverified');
 const another=events.make({store:'customers',record:{id:'customer1'},previous:null,key:'customer_change',context:scope,at:'2026-11-03T11:00:00Z'});
 await put(f.db,'commandLog',another);
 await events.drain({db:f.db,events:[another],commands:f.ports});
 const c=(await snapshot(f.db)).commandLog.find(e=>e.ref?.store==='customers');
 assert.equal(c.result.reactiveLaborCase,undefined);
});

test('tampered saved finding or fake command cannot pass the existing journal proof guard',async()=>{
 const f=await fixture();await events.drain({db:f.db,events:[f.event],commands:f.ports});
 const data=await snapshot(f.db),row=data.commandLog.find(x=>x.kind==='domain.event');
 const tampered={...row,result:{...row.result,reactiveLaborCase:{...row.result.reactiveLaborCase,findingId:'forged'}}};
 assert.equal(events.inspectReactiveLaborCase({event:tampered,records:data}).status,'case_unavailable');
 const changed={...row,result:{...row.result,reactiveLaborCase:{...row.result.reactiveLaborCase,proposedCommandId:'invoice.send'}}};
 assert.equal(events.inspectReactiveLaborCase({event:changed,records:data}).status,'case_unavailable');
});
test('existing job dossier uses current-case guard before presenting new event evidence',()=>{
 const fs=require('node:fs'),app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/inspectReactiveLaborCase/);
 assert.match(app,/verified\.reviewStatus!=='owner_review_available'/);
});
