'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const intelligence=require('../public/operational-intelligence.js');
const commands=require('../public/command-registry.js');
const source=fs.readFileSync('public/app.js','utf8');
const notifications=fs.readFileSync('public/notifications.js','utf8');
const engine=intelligence.createEngine({
 commands,calendar:{conflicts:()=>[]},revenue:{totals:()=>({total:100}),collected:()=>0},
 detectors:[...intelligence.builtinDetectors,...intelligence.optimizationDetectors]
});
const opts={today:'2026-10-28',now:'2026-10-28T12:00:00Z'};
const records=()=>({customers:[{id:'c1',name:'Customer'}],jobs:[
 {id:'j1',customerId:'c1',status:'Completed'},
 {id:'j2',customerId:'c1',status:'Planned',date:'2026-10-30'}
],crew:[{id:'crew1',name:'Electrician'}],quotes:[],invoices:[],payments:[],tasks:[],calendarEntries:[],calendarPreferences:[]});
test('completed jobs without linked invoices are review signals, not asserted missing revenue',()=>{
 const d=records();let result=engine.evaluate(d,opts);
 const f=result.findings.find(x=>x.detectorId==='job.billing_review');
 assert.ok(f);assert.equal(f.confidence,'limited');
 assert.match(f.explanation,/Review whether billing is required/);
 assert.ok(f.limitations.some(x=>/external/.test(x)));
 d.invoices.push({id:'i1',jobId:'j1',customerId:'c1',status:'Issued',lines:[{qty:1,unitPrice:100}]});
 result=engine.evaluate(d,opts);
 assert.equal(result.findings.some(x=>x.detectorId==='job.billing_review'),false);
});
test('crew assignment finding resolves when a valid crew is assigned and does not invent availability',()=>{
 const d=records();let result=engine.evaluate(d,opts);
 assert.ok(result.findings.some(x=>x.detectorId==='job.crew_assignment_review'));
 d.jobs[1].crewId='crew1';
 result=engine.evaluate(d,opts);
 assert.equal(result.findings.some(x=>x.detectorId==='job.crew_assignment_review'),false);
 d.jobs[1].crewId='not-in-roster';
 assert.ok(engine.evaluate(d,opts).findings.some(x=>x.detectorId==='job.crew_assignment_review'));
 d.crew=[];
 assert.equal(engine.evaluate(d,opts).findings.some(x=>x.detectorId==='job.crew_assignment_review'),false);
});
function followupHarness(){
 const first=source.indexOf('async function tfSyncQuoteFollowUp('),last=source.indexOf('async function saveForm(',first);
 assert.ok(first>=0&&last>first,'Follow-up engine is extracted from the live app');
 const rows=[];
 const f=new Function('all','put','uid','window',source.slice(first,last)+';return tfSyncQuoteFollowUp;');
 const run=f(async()=>rows.map(x=>({...x})),async(store,row)=>{
  assert.equal(store,'tasks');const index=rows.findIndex(x=>x.id===row.id);
  if(index>=0)rows[index]=row;else rows.push(row);
 },()=>'new-task',{TradeFlowCommands:{dateText:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}});
 return {rows,run};
}
test('quotation lifecycle creates one reminder, updates its deadline, and closes on decision',async()=>{
 const {rows,run}=followupHarness();
 await run('q1',{status:'Sent',title:'Panel upgrade',customerId:'c1',followup_date:'2026-11-05'});
 assert.equal(rows.length,1);assert.equal(rows[0].due,'2026-11-05');assert.equal(rows[0].followupAuto,true);
 await run('q1',{status:'Sent',title:'Panel upgrade revised',customerId:'c1',followup_date:'2026-11-07'},{followup_date:'2026-11-05'});
 assert.equal(rows.length,1);assert.equal(rows[0].due,'2026-11-07');assert.match(rows[0].title,/revised/);
 await run('q1',{status:'Accepted',title:'Panel upgrade revised',customerId:'c1'},{});
 assert.equal(rows[0].status,'Done');assert.equal(rows[0].completedReason,'quotation_closed');
});
test('manual follow-up tasks are not overwritten by automatic quote lifecycle',async()=>{
 const {rows,run}=followupHarness();
 rows.push({id:'manual',title:'Call customer personally',quoteId:'q1',due:'2026-11-02',status:'Open'});
 await run('q1',{status:'Sent',title:'Panel upgrade',customerId:'c1',followup_date:'2026-11-05'});
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Call customer personally');
});
test('nonredundant notification wiring preserves old UI surface and exposes new sources',()=>{
 assert.ok(notifications.includes('tfNotifObligationForm'));
 assert.ok(notifications.includes('job.billing_review'));
 assert.ok(notifications.includes('job.crew_assignment_review'));
 assert.ok(notifications.includes("route:'tasks'"));
 assert.ok(source.includes('tfSyncQuoteFollowUp(id,f,old)'));
 assert.ok(source.includes('...window.TradeFlowIntelligence.optimizationDetectors'));
});
