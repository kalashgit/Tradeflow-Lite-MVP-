'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const load=()=>import('../public/intelligence-payroll-risk.js');

test('14-day payroll arithmetic uses only owner-supplied money, never counts receivables as cash',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 const q='We have five projects, $87,000 in cash, $245,000 in receivables and $38,000 in weekly payroll. Which projects threaten payroll over the next 14 days?';
 const result=analyzeOwnerPayrollQuestion(q);
 assert.equal(result.source,'user_scenario');
 assert.equal(result.cash,87000);
 assert.equal(result.receivables,245000);
 assert.equal(result.weeklyPayroll,38000);
 assert.equal(result.twoWeekPayroll,76000);
 assert.equal(result.afterPayroll,11000);
 assert.match(result.content,/not saved TradeFlow business records/);
 assert.match(result.content,/\$87,000 − \$76,000 = \$11,000/);
 assert.match(result.content,/Receivables are not available cash until collected/);
 assert.match(result.content,/insufficient job-level payment and cost timing/);
 assert.equal(result.executionAuthority,false);
});

test('unknown payroll must not be assumed or used to produce a fake cash forecast',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 const result=analyzeOwnerPayrollQuestion('We have $87,000 cash and $245,000 receivables but do not know weekly payroll. Which jobs threaten payroll in the next 14 days?');
 assert.equal(result.weeklyPayroll,null);
 assert.equal(result.twoWeekPayroll,null);
 assert.equal(result.afterPayroll,null);
 assert.match(result.content,/cannot calculate payroll coverage/);
});

test('isolated synthetic math labels source, rejects authenticated evidence claims and invalid figures',async()=>{
 const {analyzePayrollRisk}=await load();
 assert.match(analyzePayrollRisk({source:'synthetic_fixture',cash:100,weeklyPayroll:80}).content,/SYNTHETIC SIMULATION/);
 assert.throws(()=>analyzePayrollRisk({source:'authenticated_record',cash:100}),/provenance/);
 assert.equal(analyzePayrollRisk({cash:100,weeklyPayroll:-10}).afterPayroll,null);
});

test('unrelated general chat is not captured by scenario route',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 assert.equal(analyzeOwnerPayrollQuestion('Hello TradeFlow, how are you?'),null);
 assert.equal(analyzeOwnerPayrollQuestion('Give me my local business briefing'),null);
 assert.equal(analyzeOwnerPayrollQuestion('What is our payroll policy?'),null);
});

test('same chat thread handles voice modality, source provenance and no direct commands',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const store=fs.readFileSync(path.join(__dirname,'../public/conversation-store.js'),'utf8');
 assert.match(app,/tfAISend\(instruction,\{speakReply:true,modality:'voice'\}\)/);
 assert.match(app,/role:'user',content,modality,status:'committed',source:'user'/);
 assert.match(app,/role:'assistant',content:payrollAnalysis\.content,modality:'text',status:'committed',source:'user_scenario'/);
 assert.match(store,/const SOURCES = new Set\(\['user', 'user_scenario'/);
 assert.match(store,/scopeKey: key, threadId, order: thread\.revision/);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../public/intelligence-payroll-risk.js'),'utf8'),/fetch\(|commandRegistry|execute\(/);
});
