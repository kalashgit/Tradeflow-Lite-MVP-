'use strict';
// T01: synthetic-only evaluation of the Phase A proactive detectors across 5/12/20-person firms.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {run,syntheticContext,syntheticPacket,expectations}=require('../automation/simulator/proactive-evaluation.cjs');
const fixture=require('../automation/simulator/businesses.v1.json');

test('all three synthetic firms pass the proactive detector oracle with zero leaks, duplicates or unauthorized actions',async()=>{
 const r=await run();
 assert.equal(r.status,'PASSED',JSON.stringify(r.failures));
 assert.ok(r.checks>=20);
 assert.equal(r.scorecard.tenantLeakCount,0);assert.equal(r.scorecard.unauthorizedActionCount,0);assert.equal(r.scorecard.modelCallCount,0);
 assert.equal(r.scorecard.duplicateCasesAfterReplay,0);assert.equal(r.scorecard.producedCases,r.scorecard.expectedCases);
 assert.equal(r.scorecard.authenticatedTenantObserved,false);assert.equal(r.scorecard.browserObserved,false);
 assert.equal(r.scorecard.verifiedOutcomeCoverage,null);assert.equal(r.scorecard.alertPrecisionBaseline,null);
 const five=r.results.find(x=>x.business==='TF-SIM-05');
 assert.equal(five.invoiceCases.length,1);assert.equal(five.invoiceCases[0].evidenceTrust,'synthetic');assert.equal(five.invoiceCases[0].conclusion,'missing_data');
 assert.ok(five.invoiceCases[0].missingData.includes('synthetic_evidence_only'));
 assert.equal(five.cashGapCases[0].evidence.forecast,null);
 for(const x of r.results){assert.equal(x.cashGapCases.length,1);assert.ok(x.tenant.startsWith('sim_'))}
});
test('evaluation is deterministic on replay and covers every fixture firm',async()=>{
 const a=await run(),b=await run();
 assert.deepEqual(a.results,b.results);assert.deepEqual(a.scorecard,b.scorecard);
 assert.deepEqual(a.results.map(x=>x.business),fixture.businesses.map(x=>x.id));
 assert.deepEqual(Object.keys(expectations).sort(),fixture.businesses.map(x=>x.id).sort());
});
test('synthetic contexts are projected through the real evidence field policy and never claim authorization',async()=>{
 const evidence=await import('../public/intelligence-evidence.js');
 const {context,scope}=syntheticContext(fixture.businesses[0],evidence);
 assert.equal(scope.synthetic,true);assert.ok(context.businessId.startsWith('sim_'));
 for(const r of context.records)assert.equal(evidence.canonical(evidence.projectEvidenceRecord(r.type,r.record)),evidence.canonical(r.record));
 assert.ok(!JSON.stringify(context).includes('amount":3200')); // invoice amount is not an approved evidence field
 const packet=syntheticPacket(fixture.businesses[0]);
 assert.equal(packet.status,'missing_data');assert.equal(packet.cash.availableMinor,null);assert.equal(packet.executionAuthority,false);
 assert.throws(()=>syntheticContext({...fixture.businesses[0],name:'Real Co'},evidence),/Synthetic/);
});
