'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Intelligence=require('../public/operational-intelligence.js'),Commands=require('../public/command-registry.js');
const engine=Intelligence.createEngine({commands:Commands,detectors:Intelligence.optimizationDetectors});
const scope={today:'2026-10-28',now:'2026-10-28T12:00:00Z'};
const fixture=()=>({jobs:[{id:'j1',status:'In Progress'}],
 jobCosts:[{id:'estimate',jobId:'j1',category:'Labor',type:'estimate',laborHours:20,amount:800},
 {id:'actual',jobId:'j1',category:'Labor',type:'actual',laborHours:25,amount:1000}],
 expenses:[],invoices:[],payments:[],quotes:[],customers:[],crew:[],tasks:[],events:[]});
const results=d=>engine.evaluate(d,scope).findings.filter(x=>x.detectorId==='job.labor_hours_variance_review');
test('labor-hour variance is based on recorded hours and resolves when corrected',()=>{
 const d=fixture(),f=results(d);assert.equal(f.length,1);assert.equal(f[0].recordRefs[0].id,'j1');
 assert.equal(f[0].evidence.estimatedLaborHours,20);assert.equal(f[0].evidence.recordedLaborHours,25);
 assert.equal(f[0].confidence,'limited');
 d.jobCosts[1].laborHours=19;assert.equal(results(d).length,0);
 d.jobCosts[1].laborHours=NaN;assert.equal(results(d).length,0);
});
test('revenue entry validates Labor-only hours and quarter-hour precision',()=>{
 const s=fs.readFileSync('public/revenue.js','utf8');
 assert.ok(s.includes('name="laborHours"'));assert.ok(s.includes("category!=='Labor'"));
 assert.ok(s.includes('Math.abs(laborHours*4-Math.round(laborHours*4))'));
});
test('labor variance uses the existing Notifications and Job dossier',()=>{
 const src=fs.readFileSync('public/notifications.js','utf8'),window={};
 vm.runInNewContext(src,{window,document:{addEventListener(){}},Date,Math,console},{timeout:3000});
 const d=fixture(),items=window.TradeFlowNotifications._test.generate(d,Date.parse(scope.now),engine.evaluate(d,scope));
 const item=items.find(x=>x.title==='Recorded labor exceeds planned hours');
 assert.equal(item?.recordRef?.id,'j1');assert.equal(item.route,'jobs');
});
