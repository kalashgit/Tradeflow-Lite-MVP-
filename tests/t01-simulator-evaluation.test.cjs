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
