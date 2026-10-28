'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const parser=require('../public/launch-more-commands.js');
const cases=[
 ['show budget overruns','budget'],
 ['review labor overruns','labor'],
 ['check payment discrepancies','payments'],
 ['show bid readiness issues','bids'],
 ['list material shortages','materials'],
 ['show closeout problems','closeout'],
 ['show crew credential problems','credentials']
];
test('spoken optimization reviews resolve to bounded local detector categories',()=>{
 for(const [phrase,category] of cases)assert.deepEqual(parser.parse(phrase),{action:'optimizationReview',category});
});
test('no unsupported request is converted into a financial instruction',()=>{
 assert.equal(parser.parse('send every customer payment reminder'),null);
 assert.equal(parser.parse('charge overdue customers'),null);
});
test('spoken reviews are read-only and routed to shared business intelligence',()=>{
 const app=fs.readFileSync('public/app.js','utf8'),voice=fs.readFileSync('public/voice-command.js','utf8');
 assert.ok(app.includes("if(request?.action==='optimizationReview')"));
 assert.ok(app.includes("window.TradeFlowPilot?.evaluateSnapshot(await tfPilotSnapshot())"));
 for(const detector of ['job.budget_overrun_review','invoice.payment_integrity_review','opportunity.bid_readiness_review'])assert.ok(app.includes(detector));
 assert.ok(voice.includes("'optimizationReview'"));
 assert.ok(app.includes('This does not verify external accounts'));
});
