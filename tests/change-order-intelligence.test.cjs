'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const I=require('../public/operational-intelligence.js'),C=require('../public/command-registry.js');
const engine=I.createEngine({commands:C,detectors:I.optimizationDetectors});
const context={today:'2026-10-28',now:'2026-10-28T12:00:00Z'};
const dataset=()=>({customers:[],jobs:[{id:'j1',status:'In Progress',changeOrders:[
 {id:'co1',description:'New branch circuit',amount:200,status:'proposed'}]}],invoices:[],quotes:[],payments:[],tasks:[],crew:[],events:[]});
test('proposed work prompts review without implying actual approval or invoicing',()=>{
 const d=dataset(),findings=engine.evaluate(d,context).findings;
 const review=findings.find(x=>x.detectorId==='job.unapproved_change_review');
 assert.ok(review);
 assert.equal(review.recordRefs[0].id,'j1');
 assert.equal(review.evidence.proposedCount,1);
 assert.deepEqual(review.evidence.proposedIds,['co1']);
 assert.equal(review.evidence.identifiersReliable,true);
 assert.equal(review.evidence.amountsReliable,true);
 assert.match(review.explanation,/without recorded customer approval/);
 assert.equal(review.proposedAction.commandId,'record.open');
 d.jobs[0].changeOrders[0].status='approved_recorded';
 assert.equal(engine.evaluate(d,context).findings.some(x=>x.detectorId==='job.unapproved_change_review'),false);
});
test('unapproved-change detector flags ambiguous IDs and invalid amounts without inventing an actionable total',()=>{
 const d=dataset();
 d.jobs[0].changeOrders.push({id:'co1',description:'Duplicate source',amount:-10,status:'proposed'});
 const finding=engine.evaluate(d,context).findings.find(x=>x.detectorId==='job.unapproved_change_review');
 assert.equal(finding.evidence.proposedCount,2);
 assert.equal(finding.evidence.identifiersReliable,false);
 assert.equal(finding.evidence.amountsReliable,false);
 assert.deepEqual(finding.evidence.proposedIds,[]);
 assert.ok(finding.limitations.some(x=>/missing or duplicated/.test(x)));
 assert.ok(finding.limitations.some(x=>/amount/.test(x)));
 assert.equal(finding.proposedAction.commandId,'record.open');
});
test('existing notifications route pending approval reviews to exact job',()=>{
 const s=fs.readFileSync('public/notifications.js','utf8');
 const window={};
 vm.runInNewContext(s,{window,document:{addEventListener(){}},Date,Math,console}, {timeout:3000});
 const d=dataset(),report=engine.evaluate(d,context);
 const notifications=window.TradeFlowNotifications._test.generate(d,Date.parse(context.now),report);
 const entry=notifications.find(x=>x.title==='Proposed extra work needs approval');
 assert.ok(entry);
 assert.equal(entry.route,'jobs');
 assert.equal(entry.recordRef.id,'j1');
});
