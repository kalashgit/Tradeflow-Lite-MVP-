'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validate,session,cases,run}=require('../automation/simulator/evaluate.cjs');
const fixture=require('../automation/simulator/businesses.v1.json');
test('all 12 owner scenarios have deterministic oracle outcomes',()=>{
 const r=run();assert.ok(r.scenarioCount>=10);assert.equal(r.scenarioPasses,r.scenarioCount,JSON.stringify(r.failures));
 assert.equal(r.assertionsPassed,r.assertions);assert.equal(r.scorecard.applicationCoverage,0);
 assert.equal(r.scorecard.numericalAccuracyAgainstApp,null);assert.ok(r.results.every(x=>x.appObserved===false&&x.externalActions===0));
});
test('isolated reset restores exact fixture and cannot affect another company',()=>{
 const s=session('TF-SIM-05'),other=session('TF-SIM-12');const before=s.read(),otherBefore=other.read();
 s.apply({type:'payment',invoiceId:'i-101',amount:1000});assert.equal(s.trace().length,1);
 assert.deepEqual(other.read(),otherBefore);s.reset();assert.deepEqual(s.read(),before);assert.deepEqual(s.trace(),[]);
});
test('invalid external event, overpayment and foreign customer fail closed',()=>{
 const s=session('TF-SIM-05'),before=s.read();
 assert.throws(()=>s.apply({type:'send_email'}),/Unsupported/);
 assert.throws(()=>s.apply({type:'payment',invoiceId:'i-101',amount:99999}),/Overpayment/);
 assert.deepEqual(s.read(),before);assert.deepEqual(s.trace(),[]);
 const invalid=structuredClone(fixture.businesses[0]);invalid.invoices[0].customerId='foreign';assert.throws(()=>validate(invalid),/Invalid invoice link/);
});
test('stable trace hashes and deterministic outputs on replay',()=>{
 const a=run(),b=run();assert.deepEqual(a,b);assert.equal(new Set(cases.map(x=>x.id)).size,cases.length);
});
test('strict Gregorian dates reject impossible, malformed and timezone-bearing input without state mutation',()=>{
 const bad=['2026-02-30','2025-02-29','2026-04-31','1900-02-29','2026-13-01','2026-00-12','2026-01-00','2026-1-02','2026-01-2','2026-01-01T00:00:00Z','2026-01-01+02:00','2026-01-01 ','0000-01-01','2026-02-29'];
 const s=session('TF-SIM-12'),before=s.read(),hash=s.reset();
 for(const date of bad){assert.throws(()=>s.apply({type:'delay',date}),/Invalid Gregorian date/,date);assert.deepEqual(s.read(),before);assert.equal(s.reset(),hash);assert.deepEqual(s.trace(),[])}
});
test('Gregorian leap-year and timezone-independent date-only arithmetic',()=>{
 const s=session('TF-SIM-12');
 for(const date of ['2000-02-29','2024-02-29','2028-02-29','2400-02-29','2026-02-28','2026-12-31','2026-01-01']){
  s.reset();s.apply({type:'delay',date});assert.equal(s.read().simulatedDeliveryDate,date);assert.equal(s.trace().length,1);
 }
 assert.throws(()=>s.apply({type:'delay',date:'2100-02-29'}),/Invalid Gregorian date/);
});
