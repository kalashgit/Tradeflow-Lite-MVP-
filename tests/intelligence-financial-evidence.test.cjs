'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../public/intelligence-financial-evidence.js');
const scope={businessId:'TF-SIM-12',actorId:'owner-sim'};
const fixture=()=>({sourceKind:'synthetic_fixture',businessId:'TF-SIM-12',observedDate:'2026-11-09',
 period:{startDate:'2026-11-09',endDate:'2026-11-22'},cash:87000,receivables:245000,obligationsComplete:true,
 obligations:[{id:'pay-1',kind:'payroll',amount:38000,dueDate:'2026-11-13'},
  {id:'pay-2',kind:'payroll',amount:38000,dueDate:'2026-11-20'}]});
const evaluate=async(evidence=fixture(),options={})=>(await load()).evaluateFinancialEvidence({evidence,scope,asOfDate:'2026-11-09',...options});

test('strict Gregorian validation rejects normalization and ambiguous date formats',async()=>{
 const {strictFinancialDate:date}=await load();
 for(const invalid of ['2026-02-30','2026-04-31','2025-02-29','2026-13-01','2026-00-01','2026-1-09','09/11/2026','2026-11-09T00:00:00Z','2026-11-09+02:00','2026-11-09 ','0000-01-01'])assert.equal(date(invalid),null,invalid);
 for(const valid of ['2024-02-29','2000-02-29','2026-02-28','2026-12-31','2027-01-01','0001-01-01'])assert.ok(Number.isFinite(date(valid)),valid);
});

test('synthetic evidence calculates only dated complete obligations and excludes receivables',async()=>{
 const r=await evaluate();
 assert.equal(r.status,'conditional_calculation');
 assert.equal(r.obligationsTotal,76000);
 assert.equal(r.afterObligations,11000);
 assert.equal(r.receivables,245000);
 assert.equal(r.receivablesExcluded,true);
 assert.match(r.explanation,/SYNTHETIC SIMULATION/);
 assert.equal(r.executionAuthority,false);
});

test('impossible and timezone-qualified dates fail without affected calculations',async()=>{
 for(const value of ['2026-02-30','2026-11-09T00:00:00+02:00','11/09/2026']){
  const e=fixture();e.obligations[0].dueDate=value;
  const r=await evaluate(e);
  assert.equal(r.status,'needs_clarification');
  assert.equal(r.afterObligations,null);
 }
 const crossing=fixture();crossing.period={startDate:'2026-12-31',endDate:'2027-01-13'};
 crossing.obligations=[{id:'pay-1',kind:'payroll',amount:100,dueDate:'2027-01-01'}];
 assert.equal((await evaluate(crossing,{asOfDate:'2026-12-31'})).status,'missing_data'); // observed evidence is stale
 crossing.observedDate='2026-12-31';
 assert.equal((await evaluate(crossing,{asOfDate:'2026-12-31'})).afterObligations,86900);
});

test('stale, future, ambiguous periods and missing dates fail closed',async()=>{
 for(const changed of [
  {observedDate:'2026-10-01'}, {observedDate:'2026-11-10'}, {observedDate:null},
  {period:{startDate:'2026-11-09',endDate:'2026-11-23'}},
  {period:{startDate:'2026-11-10',endDate:'2026-11-22'}},
  {period:{startDate:'2026-11-09T00:00Z',endDate:'2026-11-22'}}
 ]){
  const r=await evaluate({...fixture(),...changed});
  assert.ok(['needs_clarification','missing_data'].includes(r.status));
  assert.equal(r.afterObligations,null);
 }
});

test('malformed, duplicate, incomplete and unbounded obligations fail safely',async()=>{
 for(const mutate of [
  e=>{e.obligationsComplete=false},e=>{e.obligations=[]},e=>{e.obligations[0].amount=-5},
  e=>{e.obligations[0].amount='38000'},e=>{e.obligations[0].id=e.obligations[1].id},
  e=>{e.obligations[0].dueDate='2026-11-23'},e=>{e.obligations[0].kind='invoice'},
  e=>{e.obligations=[{id:'mat-1',kind:'materials',amount:100,dueDate:'2026-11-12'}]}
 ]){
  const e=fixture();mutate(e);
  const r=await evaluate(e);
  assert.ok(['needs_clarification','missing_data'].includes(r.status),r.reason);
  assert.equal(r.afterObligations,null);
 }
});

test('tenant, actor identity and verified source claims are never inferred from fixtures',async()=>{
 assert.equal((await evaluate(fixture(),{scope:{...scope,businessId:'OTHER'}})).reason,'scope_mismatch');
 assert.equal((await evaluate({...fixture(),verified:true})).reason,'unverified_source_claim');
 const source={...fixture(),sourceKind:'verified_tenant_record',identity:{issuer:'https://auth.example',subject:'actor-a',businessId:'TF-SIM-12'},recordRefs:['invoices:inv-1@2']};
 assert.equal((await evaluate(source)).reason,'unauthorized_or_unverifiable_source');
 const authorized={...scope,authorization:{verified:true,issuer:'https://auth.example',subject:'actor-a',businessId:'TF-SIM-12',role:'owner'}};
 assert.equal((await evaluate(source,{scope:authorized})).status,'conditional_calculation');
 assert.equal((await evaluate({...source,identity:{...source.identity,subject:'actor-b'}},{scope:authorized})).reason,'unauthorized_or_unverifiable_source');
 assert.equal((await evaluate({...source,recordRefs:[]},{scope:authorized})).reason,'unauthorized_or_unverifiable_source');
});

test('unknown provenance and missing cash never return a forecast or execution authority',async()=>{
 const r=await evaluate({...fixture(),sourceKind:'model_guess'});
 assert.equal(r.status,'needs_clarification');
 assert.equal(r.afterObligations,null);
 const missing=await evaluate({...fixture(),cash:null});
 assert.equal(missing.status,'missing_data');
 assert.equal(missing.afterObligations,null);
 assert.equal(missing.executionAuthority,false);
});

test('free-text dated payroll scenarios never bypass the strict financial date gate',async()=>{
 const {analyzeOwnerPayrollQuestion}=await import('../public/intelligence-payroll-risk.js');
 for(const [date,reason] of [['2026-02-30','invalid_or_ambiguous_date'],['11/13/2026','invalid_or_ambiguous_date'],['2026-11-13','unverified_dated_obligation']]){
  const r=analyzeOwnerPayrollQuestion('Cash $87,000, weekly payroll $38,000 due '+date+'. Which jobs threaten payroll in 14 days?');
  assert.equal(r.status,'needs_clarification');
  assert.equal(r.reason,reason);
  assert.equal(r.afterPayroll,null);
  assert.equal(r.executionAuthority,false);
 }
});
