'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {statesFor}=require('../src/research-gates.cjs');
const {UNKNOWN,assessEvidence,runEpistemicGates}=require('../src/epistemic-gates.cjs');
test('ambiguous evidence cannot be promoted to persistent knowledge',()=>{
 const r=assessEvidence([{state:{A:0,B:0,C:0},result:0}]);
 assert.equal(r.status,'ambiguous');
 assert.ok(r.candidateCount>1);
 assert.equal(r.admitToPersistentMemory,false);
});
test('fully observed novel laws cannot be forced into known causal grammar',()=>{
 const states=statesFor(['A','B','C']);
 for(const world of UNKNOWN){
  const evidence=states.map(state=>({state,result:world.evaluate(state)}));
  const r=assessEvidence(evidence);
  assert.equal(r.status,'unexplained_or_inconsistent',world.name);
  assert.equal(r.candidateCount,0);
  assert.equal(r.admitToPersistentMemory,false);
 }
});
test('even a uniquely identified toy law is not automatically written to memory',()=>{
 const states=statesFor(['A','B','C']);
 const r=assessEvidence(states.map(state=>({state,result:state.A&state.B})));
 assert.equal(r.status,'uniquely_identified');
 assert.equal(r.candidateCount,1);
 assert.equal(r.admitToPersistentMemory,false);
});
test('epistemic gate report accurately labels deterministic limitations',()=>{
 const r=runEpistemicGates();
 assert.equal(r.passed,true);
 assert.equal(r.realModelInference,false);
 assert.equal(r.memoryEnabled,false);
 assert.equal(r.unexplainedNovelMechanisms.length,4);
});
