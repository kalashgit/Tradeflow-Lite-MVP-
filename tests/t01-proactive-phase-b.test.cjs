'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {run,firm}=require('../automation/simulator/proactive-phase-b-evaluation.cjs');
const overlay=require('../automation/simulator/proactive-scenarios.v1.json');

test('all Phase B synthetic scenarios pass with zero leaks, model calls or unauthorized actions',async()=>{
 const r=await run();
 assert.equal(r.status,'PASSED',JSON.stringify(r.failures,null,1));
 assert.equal(r.scorecard.scenarios,22);assert.equal(r.scorecard.failed,0);
 assert.equal(r.scorecard.tenantLeakCount,0);assert.equal(r.scorecard.unauthorizedActionCount,0);assert.equal(r.scorecard.modelCallCount,0);
 assert.equal(r.scorecard.verifiedReceipts,1);assert.equal(r.scorecard.realBusinessImprovement,null);
 assert.equal(r.scorecard.authenticatedTenantObserved,false);assert.equal(r.scorecard.browserObserved,false);
 for(const id of ['S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11','S12','S13','S14','S15','S16','S17','S18','S19','S20'])assert.equal(r.results.find(x=>x.id===id)?.status,'PASS',id);
});
test('evaluation is deterministic and the overlay stays synthetic and bounded',async()=>{
 const a=await run(),b=await run();
 assert.deepEqual(a.results,b.results);assert.equal(a.fixtureHash,b.fixtureHash);
 assert.equal(overlay.synthetic,true);
 for(const id of Object.keys(overlay.overlays)){const f=firm(id);assert.ok(f.employees>0);for(const list of Object.values(overlay.overlays[id]))assert.ok(Array.isArray(list)&&list.length<=50)}
 assert.throws(()=>firm('TF-REAL-01'),/Synthetic firm required/);
});
