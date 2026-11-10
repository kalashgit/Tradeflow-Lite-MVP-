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

test('conflicting cash balances never select the first value or calculate payroll coverage',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 const r=analyzeOwnerPayrollQuestion('We have cash of $10,000, cash of $1,000, weekly payroll of $3,000. What threatens payroll in 14 days?');
 assert.equal(r.status,'needs_clarification');
 assert.equal(r.reason,'contradiction');
 assert.equal(r.cash,null);
 assert.equal(r.twoWeekPayroll,null);
 assert.equal(r.afterPayroll,null);
 assert.match(r.content,/Contradictory or repeated/);
 assert.match(r.content,/cash of \$10,000 \/ cash of \$1,000/);
 assert.match(r.content,/Please clarify/);
 assert.doesNotMatch(r.content,/= \$4,000|shortfall of \$5,000/);
 assert.equal(r.executionAuthority,false);
});

test('stale/current labels do not silently authorize picking one balance',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 const r=analyzeOwnerPayrollQuestion('Yesterday cash was $10,000, but current cash is $1,000. Weekly payroll $3,000. What threatens payroll in the next two weeks?');
 assert.equal(r.status,'needs_clarification');
 assert.equal(r.reason,'historical_revision');
 assert.equal(r.afterPayroll,null);
 assert.match(r.content,/stale, and current figures cannot be safely selected/);
 const unlabelled=analyzeOwnerPayrollQuestion('Cash was $10,000, but now $1,000. Weekly payroll $3,000. What threatens payroll in 14 days?');
 assert.equal(unlabelled.status,'needs_clarification');
 assert.equal(unlabelled.reason,'historical_revision');
 assert.equal(unlabelled.afterPayroll,null);
});

test('explicit alternatives are distinguished from contradictory claims without choosing one',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 const r=analyzeOwnerPayrollQuestion('Option A: cash $10,000. Option B: cash $1,000. Weekly payroll $3,000. What threatens payroll in 14 days?');
 assert.equal(r.status,'needs_clarification');
 assert.equal(r.reason,'alternatives');
 assert.equal(r.afterPayroll,null);
 assert.match(r.content,/Alternative financial scenarios/);
});

test('unlabelled same-clause cash alternatives and corrections never select the first balance',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 for(const statement of [
  'Cash is $10,000 or $1,000, and weekly payroll is $3,000.',
  'Cash is $10,000 but actually $1,000, and weekly payroll is $3,000.',
  'Cash is $10,000 but rather $1,000, and weekly payroll is $3,000.',
  'Cash is $10,000 or 1,000, and weekly payroll is $3,000.'
 ]){
  const r=analyzeOwnerPayrollQuestion(statement+' What threatens payroll in 14 days?');
  assert.equal(r?.status,'needs_clarification',statement);
  assert.equal(r.afterPayroll,null,statement);
  assert.equal(r.cash,null,statement);
  assert.match(r.content,/unlabelled same-clause alternative or correction/);
  assert.match(r.content,/Please clarify/);
  assert.equal(r.executionAuthority,false);
 }
});

test('unlabelled second payroll amount cannot produce confident payroll or cash calculations',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 for(const phrasing of ['Weekly payroll is $3,000 or $8,000','Weekly payroll is $3,000 but actually $8,000']){
  const r=analyzeOwnerPayrollQuestion('Cash $20,000. '+phrasing+'. What threatens payroll in 14 days?');
  assert.equal(r.status,'needs_clarification');
  assert.equal(r.weeklyPayroll,null);
  assert.equal(r.twoWeekPayroll,null);
  assert.equal(r.afterPayroll,null);
 }
});

test('separate clearly labelled fields and dated revisions are not mistaken for same-clause choices',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 const clear=analyzeOwnerPayrollQuestion('Cash $20,000 and weekly payroll $3,000. What threatens payroll in 14 days?');
 assert.equal(clear.status,'conditional_calculation');
 assert.equal(clear.afterPayroll,14000);
 const revision=analyzeOwnerPayrollQuestion('Yesterday cash was $10,000; today cash is $1,000. Weekly payroll $3,000. What threatens payroll in 14 days?');
 assert.equal(revision.status,'needs_clarification');
 assert.equal(revision.reason,'historical_revision');
});

test('negative balances and material payments cannot silently become positive or be ignored',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 const negatives=['Cash -$1,000 and weekly payroll $3,000. What threatens payroll in 14 days?',
  'We have -$1,000 cash and $3,000 weekly payroll. What threatens payroll in 14 days?'];
 for(const question of negatives){
  const r=analyzeOwnerPayrollQuestion(question);
  assert.equal(r.status,'needs_clarification');
  assert.equal(r.reason,'unsupported_negative');
  assert.equal(r.afterPayroll,null);
 }
 const material=analyzeOwnerPayrollQuestion('Cash $87,000, weekly payroll $38,000, materials cost $25,000. Which jobs threaten payroll in 14 days?');
 assert.equal(material.status,'needs_clarification');
 assert.equal(material.reason,'unverified_outflows');
 assert.equal(material.afterPayroll,null);
 assert.match(material.content,/supplier due dates/);
 const conflictingMaterial=analyzeOwnerPayrollQuestion('Cash $87,000 and weekly payroll $38,000, materials cost $25,000, materials cost $40,000. Which jobs threaten payroll in 14 days?');
 assert.equal(conflictingMaterial.reason,'contradiction');
 assert.equal(conflictingMaterial.afterPayroll,null);
});

test('repeated matching figures and conflicting weekly payroll are withheld, not deduplicated',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 for(const question of [
  'Cash $8,000, cash $8,000, weekly payroll $3,000. What threatens payroll in 14 days?',
  'Cash $8,000 and weekly payroll $3,000, weekly payroll $4,000. What threatens payroll in 14 days?'
 ]){
  const r=analyzeOwnerPayrollQuestion(question);
  assert.equal(r.status,'needs_clarification');
  assert.equal(r.afterPayroll,null);
 }
});

test('natural cash and payroll wording is accepted when each value is unambiguous',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 const r=analyzeOwnerPayrollQuestion('Cash $1,000 and weekly payroll $1,000. What threatens payroll in the next 14 days?');
 assert.equal(r.status,'conditional_calculation');
 assert.equal(r.cash,1000);
 assert.equal(r.weeklyPayroll,1000);
 assert.equal(r.afterPayroll,-1000);
 assert.match(r.content,/shortfall/);
 assert.match(r.content,/exact payroll dates and amounts/);
 assert.match(r.content,/supplier and subcontractor payments/);
});

test('unsupported cents never become a misleading rounded integer',async()=>{
 const {analyzeOwnerPayrollQuestion}=await load();
 const r=analyzeOwnerPayrollQuestion('Cash of $1,000.50, weekly payroll $1,000. What threatens payroll in 14 days?');
 assert.equal(r.status,'needs_clarification');
 assert.equal(r.afterPayroll,null);
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
