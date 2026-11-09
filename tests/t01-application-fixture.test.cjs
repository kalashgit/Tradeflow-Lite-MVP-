'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createPayrollFixture,evaluateAppPayroll}=require('../automation/simulator/app-payroll-fixture.cjs');
test('disposable S02 adapter has scoped synthetic records and resets without external storage',()=>{
 const s=createPayrollFixture(),before=s.read();assert.equal(before.tenantId,'sim_TF_SIM_12');
 assert.equal(before.currency,'USD');assert.equal(before.invoices[0].outstanding,10000);
 assert.equal(before.supplierCommitments[0].amount,4800);assert.equal(before.payroll.length,2);
 before.openingCash.amount=999999;assert.equal(s.read().openingCash.amount,9000);
 assert.equal(s.reset(),s.reset());
});
test('unavailable application module remains unscored rather than synthesizing a pass',async()=>{
 const r=await evaluateAppPayroll();assert.equal(r.appObserved,false);assert.equal(r.observed,null);
 assert.equal(r.numericalDeviation,null);assert.equal(r.providerMode,null);
});
test('actual TradeFlow payroll module returns observed result when explicitly supplied',async(t)=>{
 if(!process.env.T01_APP_PAYROLL_MODULE){t.skip('Set T01_APP_PAYROLL_MODULE to tested integration checkout; not available on standalone PR #63');return}
 const r=await evaluateAppPayroll({modulePath:process.env.T01_APP_PAYROLL_MODULE});
 assert.equal(r.appObserved,true);assert.equal(r.provenanceVerified,true);assert.equal(r.observed.executionAuthority,false);
 assert.equal(r.observed.twoWeekPayroll,14500);assert.equal(r.observed.afterPayroll,-5500);
 assert.equal(r.oracle.cashAfterPayrollAndSuppliers,-10300);assert.equal(r.numericalDeviation,4800);
 assert.equal(r.supplierIncludedInObservedCalculation,false);
});
