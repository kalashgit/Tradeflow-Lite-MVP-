'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
test('owner-entered multi-project scenario goes to AI, not local-record briefing',async()=>{
 const mod=await import(pathToFileURL(path.join(__dirname,'../public/intelligence-briefing.js')).href);
 const scenario="I'm the owner of a commercial electrical contracting company in Austin, Texas. We have 16 employees and five projects worth $1.85 million. Project 1 costs $420,000 and its labor costs are running 18% over budget. Project 2 has an unsigned $75,000 change order. The business has $87,000 cash, $245,000 receivables and $38,000 weekly payroll. I need an operations overview, a prioritized 30-day recovery plan, and a cash-flow analysis with calculations, assumptions and actionable recommendations.";
 assert.equal(mod.isBusinessBriefingRequest(scenario),false);
 assert.equal(mod.isBusinessBriefingRequest('Give me my local business briefing'),true);
 assert.equal(mod.isBusinessBriefingRequest('business overview'),true);
 assert.equal(mod.isBusinessBriefingRequest('What is our business situation and how do we fix it?'),false);
 assert.match(source,/const content=String\(text\|\|'\)\.trim\(\)\.slice\(0,6000\)/);
});
test('frontend and Worker permit bounded 6000-character scenario input',()=>{
 const worker=fs.readFileSync(path.join(__dirname,'../src/iphone-preview.js'),'utf8');
 const store=fs.readFileSync(path.join(__dirname,'../public/conversation-store.js'),'utf8');
 assert.match(worker,/x\.content\.length>6000/);
 assert.match(store,/value\.content\.length > 6000/);
});
