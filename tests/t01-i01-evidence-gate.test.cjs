'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {fixtureEvidence,sourceCheck,runFinancialEvidenceGate}=require('../automation/simulator/i01-evidence-gate.cjs');

test('T01 adapter consumes existing synthetic firm, never upgrades cash or completeness',()=>{
 const realistic=fixtureEvidence();
 const bounded=fixtureEvidence({closedWorld:true});
 assert.equal(realistic.evidence.sourceKind,'synthetic_fixture');
 assert.equal(realistic.evidence.businessId,'sim_TF_SIM_12');
 assert.equal(realistic.scope.businessId,realistic.evidence.businessId);
 assert.equal(realistic.metadata.bankVerified,false);
 assert.equal(realistic.evidence.obligationsComplete,false);
 assert.equal(bounded.evidence.obligationsComplete,true);
 assert.equal(bounded.metadata.closedWorldAssumption,true);
 assert.equal(realistic.evidence.obligations.reduce((n,x)=>n+x.amount,0),19300);
 assert.equal(realistic.evidence.receivables,10000);
 assert.deepEqual(realistic.evidence.obligations.map(x=>x.dueDate),
  ['2026-11-13','2026-11-20','2026-11-17']);
 const isolated=fixtureEvidence();
 isolated.evidence.cash=999999;
 assert.equal(fixtureEvidence().evidence.cash,9000);
});

test('no application available means real app metrics explicitly null',async()=>{
 const r=await runFinancialEvidenceGate();
 assert.equal(r.status,'APP_NOT_RUN');
 assert.equal(r.appObserved,false);
 assert.equal(r.scorecard.conditionalNumericDeviation,null);
 assert.equal(r.scorecard.model,null);
 assert.equal(r.scorecard.authenticatedTenant,null);
 assert.deepEqual(r.observations,[]);
});

test('I01 module source pin rejects arbitrary and modified files',()=>{
 assert.throws(()=>sourceCheck(''),/Explicit I01 module path/);
 assert.throws(()=>sourceCheck('/tmp/attack.js'),/Unexpected I01 application module/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'t01-i01-'));
 try{
  const file=path.join(dir,'intelligence-financial-evidence.js');
  fs.writeFileSync(file,'export const evaluateFinancialEvidence=()=>({status:"pass"});\n');
  assert.throws(()=>sourceCheck(file),/I01 module SHA mismatch/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('actual pinned I01 app evaluator rejects incomplete evidence and proves conditional synthetic oracle',async t=>{
 if(!process.env.T01_APP_FINANCIAL_MODULE){
  t.skip('I01 module path missing: application NOT RUN, no fabricated pass');
  return;
 }
 const r=await runFinancialEvidenceGate({modulePath:process.env.T01_APP_FINANCIAL_MODULE});
 assert.equal(r.status,'APP_EVIDENCE_MODULE_OBSERVED_NOT_BROWSER');
 assert.equal(r.appObserved,true);
 assert.equal(r.providerMode,'none_no_model_invoked');
 assert.equal(r.scorecard.guardedCasesPassed,10,JSON.stringify(r.failures));
 assert.equal(r.scorecard.guardedCasesTotal,10);
 assert.equal(r.scorecard.realisticIncompleteCash,null);
 assert.equal(r.scorecard.conditionalNumericDeviation,0);
 assert.equal(r.oracle.conditionalAfterAllObligations,-10300);
 assert.equal(r.oracle.actualBusinessCashKnown,false);
 assert.deepEqual(r.failures,[]);
 const pass=r.observations.find(x=>x.id==='closed_world_synthetic_only');
 const fail=r.observations.find(x=>x.id==='realistic_incomplete');
 assert.equal(pass.observed.afterObligations,-10300);
 assert.equal(pass.observed.source,'synthetic_fixture');
 assert.equal(pass.observed.executionAuthority,false);
 assert.equal(fail.observed.status,'missing_data');
 assert.equal(fail.observed.afterObligations,null);
 assert.equal(r.scorecard.falseVerifiedSourceCount,0);
 assert.equal(r.scorecard.browser,null);
 assert.equal(r.scorecard.authenticatedTenant,null);
 assert.equal(r.scorecard.workflowReceipts,null);
 assert.equal(r.observations.every(x=>x.immutable),true);
});
