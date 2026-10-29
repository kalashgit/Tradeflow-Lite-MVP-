'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Intel=require('../public/operational-intelligence.js'),Commands=require('../public/command-registry.js');
const engine=Intel.createEngine({commands:Commands,detectors:Intel.optimizationDetectors});
const when={today:'2026-10-28',now:'2026-10-28T12:00:00Z'};
const fixture=()=>({jobs:[{id:'j1',status:'In Progress'}],
 jobCosts:[{id:'b1',jobId:'j1',type:'estimate',amount:1000},{id:'a1',jobId:'j1',type:'actual',amount:800}],
 expenses:[{id:'e1',jobId:'j1',amount:250}],
 invoices:[{id:'i1',customerId:'c1',status:'Issued',currency:'USD',taxRate:0,lines:[{qty:1,unitPrice:100}]}],
 payments:[{id:'p1',invoiceId:'i1',customerId:'c1',currency:'USD',amount:150}],
 customers:[{id:'c1',name:'Customer'}],tasks:[],quotes:[],crew:[],events:[]});
const findings=(d,type)=>engine.evaluate(d,when).findings.filter(x=>x.detectorId===type);
test('budget overrun uses recorded costs only and resolves after documented correction',()=>{
 const d=fixture();const f=findings(d,'job.budget_overrun_review');
 assert.equal(f.length,1);assert.equal(f[0].evidence.recordedCosts,1050);assert.equal(f[0].evidence.budget,1000);
 assert.equal(f[0].recordRefs[0].id,'j1');assert.equal(f[0].confidence,'limited');
 d.expenses[0].amount=150;
 assert.equal(findings(d,'job.budget_overrun_review').length,0);
 d.expenses[0].amount='unexpected';
 assert.equal(findings(d,'job.budget_overrun_review').length,0,'invalid amounts must not be silently coerced');
});
test('payment overrecording is flagged without claiming provider settlement',()=>{
 const d=fixture(),f=findings(d,'invoice.payment_integrity_review');
 assert.equal(f.length,1);assert.equal(f[0].evidence.invoiceTotal,100);
 assert.equal(f[0].evidence.recordedPayments,150);
 d.payments[0].amount=100;
 assert.equal(findings(d,'invoice.payment_integrity_review').length,0);
 d.payments[0].customerId='other';
 assert.equal(findings(d,'invoice.payment_integrity_review').length,1);
 assert.match(findings(d,'invoice.payment_integrity_review')[0].explanation,/inconsistent/);
});
test('both financial findings route through the existing Notifications surface',()=>{
 const s=fs.readFileSync('public/notifications.js','utf8'),window={};
 vm.runInNewContext(s,{window,document:{addEventListener(){}},Date,Math,console},{timeout:3000});
 const d=fixture(),notices=window.TradeFlowNotifications._test.generate(d,Date.parse(when.now),engine.evaluate(d,when));
 const a=notices.find(x=>x.title==='Job spending exceeds recorded budget'),b=notices.find(x=>x.title==='Invoice payments need reconciliation');
 assert.equal(a?.recordRef?.id,'j1');assert.equal(b?.recordRef?.id,'i1');
});
