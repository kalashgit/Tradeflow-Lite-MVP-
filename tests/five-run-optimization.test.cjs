'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Intel=require('../public/operational-intelligence.js'),Commands=require('../public/command-registry.js');
const engine=Intel.createEngine({commands:Commands,detectors:Intel.optimizationDetectors});
const date={today:'2026-10-28',now:'2026-10-28T12:00:00Z'};
const fixture=()=>({jobs:[
 {id:'material',status:'Planned',date:'2026-10-30',materialsStatus:'Not Ready',materialsNotes:'Breakers not delivered'},
 {id:'closeout',status:'Completed',date:'2026-10-12',closeoutStatus:'Pending'},
 {id:'credential',status:'Planned',date:'2026-11-03',crewId:'e1'}],
 crew:[{id:'e1',name:'Electrician',credentialExpires:'2026-11-02',credentialReference:'State licensing registry'}],
 tasks:[],invoices:[],quotes:[],customers:[],payments:[],events:[]});
const detect=(d,type)=>engine.evaluate(d,date).findings.filter(f=>f.detectorId===type);
test('materials not ready gives source-grounded warning and resolves once confirmed ready',()=>{
 const d=fixture();
 let findings=detect(d,'job.material_readiness_review');
 assert.equal(findings.length,1);assert.equal(findings[0].recordRefs[0].id,'material');
 assert.match(findings[0].explanation,/Not Ready/);
 d.jobs[0].materialsStatus='Ready';
 assert.equal(detect(d,'job.material_readiness_review').length,0);
});
test('incomplete closeout requires completed evidence or documented waiver',()=>{
 const d=fixture();assert.equal(detect(d,'job.closeout_evidence_review').length,1);
 d.jobs[1].closeoutStatus='Complete';d.jobs[1].closeoutEvidence='';assert.equal(detect(d,'job.closeout_evidence_review').length,1);
 d.jobs[1].closeoutEvidence='Signed work completion checklist 2026-10-12';
 assert.equal(detect(d,'job.closeout_evidence_review').length,0);
 d.jobs[1].closeoutStatus='Waived';d.jobs[1].closeoutEvidence='Customer waiver documented';
 assert.equal(detect(d,'job.closeout_evidence_review').length,0);
});
test('recorded credential date compared against scheduled job date, not assumed license validity',()=>{
 const d=fixture();const results=detect(d,'job.crew_credential_review');
 assert.equal(results.length,1);assert.equal(results[0].confidence,'limited');
 assert.equal(results[0].recordRefs[0].id,'credential');
 d.crew[0].credentialExpires='2026-11-04';
 assert.equal(detect(d,'job.crew_credential_review').length,0);
});
test('all three findings appear in existing notification surface with source records',()=>{
 const s=fs.readFileSync('public/notifications.js','utf8'),window={};
 vm.runInNewContext(s,{window,document:{addEventListener(){}},Date,Math,console},{timeout:3000});
 const d=fixture(),result=engine.evaluate(d,date);
 const notices=window.TradeFlowNotifications._test.generate(d,Date.parse(date.now),result);
 for(const [title,id] of [['Materials not ready for upcoming job','material'],['Completed job closeout needs review','closeout'],['Crew credential requires verification','credential']]){
  const notice=notices.find(x=>x.title===title);assert.ok(notice,title);assert.equal(notice.recordRef?.id,id);
 }
});
test('job and crew editors capture missing readiness and credential evidence',()=>{
 const app=fs.readFileSync('public/app.js','utf8'),ops=fs.readFileSync('public/operations.js','utf8');
 for(const key of ['materialsStatus','materialsNotes','closeoutStatus','closeoutEvidence'])assert.ok(app.includes(key));
 for(const key of ['credentialExpires','credentialReference','offDutyOverride'])assert.ok(ops.includes(key));
 assert.ok(app.includes('Document the actual closeout evidence before marking documentation complete'));
 assert.ok(ops.includes('An off-duty override requires a recorded explanation'));
});
