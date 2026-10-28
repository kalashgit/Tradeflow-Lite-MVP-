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
 assert.match(review.explanation,/without recorded customer approval/);
 assert.equal(review.proposedAction.commandId,'record.open');
 d.jobs[0].changeOrders[0].status='approved_recorded';
 assert.equal(engine.evaluate(d,context).findings.some(x=>x.detectorId==='job.unapproved_change_review'),false);
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
