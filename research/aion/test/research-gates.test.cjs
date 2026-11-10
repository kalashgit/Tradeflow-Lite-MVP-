'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {statesFor,candidatesFor,evaluateRule,consistentRules,activeChoice,identifyRule,firstViolation,discoverDrift,runResearchGates}=require('../src/research-gates.cjs');
test('held-out 4-switch candidate space has 18 distinct mechanisms and 16 interventions',()=>{
 const switches=['A','B','C','D'];
 const rules=candidatesFor(switches);
 assert.equal(rules.length,18);
 assert.equal(statesFor(switches).length,16);
 assert.equal(new Set(rules.map(r=>JSON.stringify(r))).size,18);
});
test('active controller identifies every 3- and 4-variable rule without hidden answer access',()=>{
 for(const switches of [['A','B','C'],['A','B','C','D']]){
  for(const rule of candidatesFor(switches)){
   const result=identifyRule(rule,{variables:switches,policy:'active'});
   assert.equal(result.identified,true);
   assert.ok(result.experiments<=2**switches.length);
   const survivors=consistentRules(result.history,switches);
   assert.equal(survivors.length,1);
  }
 }
});
test('active experiments distinguish hypotheses from only their observed predictions',()=>{
 const vars=['A','B','C'];
 const obs=[{state:{A:0,B:1,C:1},result:1}];
 const suggested=activeChoice(obs,vars);
 assert.ok(suggested);
 assert.notDeepEqual(suggested,obs[0].state);
 assert.ok(consistentRules(obs,vars).length>1);
});
test('all ordered mechanism changes are detected and reidentified',()=>{
 const rules=candidatesFor(['A','B','C']);
 let count=0;
 for(const a of rules)for(const b of rules){
  if(JSON.stringify(a)===JSON.stringify(b))continue;
  const outcome=discoverDrift(a,b);
  assert.equal(outcome.detected,true);
  assert.equal(outcome.recovered,true);
  assert.equal(outcome.falseAlarms,0);
  assert.ok(outcome.detectionDelay>=1&&outcome.detectionDelay<=8);
  count++;
 }
 assert.equal(count,72);
});
test('control gate report distinguishes deterministic success from real Qwen performance',()=>{
 const r=runResearchGates();
 assert.equal(r.passed,true);
 assert.equal(r.realModelInference,false);
 assert.equal(r.persistentMemoryEnabled,false);
 assert.equal(r.core.ruleCount,9);
 assert.equal(r.heldOutFourSwitch.ruleCount,18);
 assert.equal(r.drift.orderedTransitions,72);
 assert.equal(r.drift.detected,72);
 assert.equal(r.drift.recovered,72);
 assert.equal(r.drift.falseAlarms,0);
 assert.ok(r.core.active.meanExperiments<r.core.fixed.meanExperiments);
 assert.ok(r.heldOutFourSwitch.active.meanExperiments<r.heldOutFourSwitch.fixed.meanExperiments);
});

test('observable drift monitor detects only measured contradictions, never the hidden rule',()=>{
 const rule={op:'xor',inputs:['A','C']};
 const seen=[{state:{A:1,B:0,C:1},result:0},{state:{A:1,B:0,C:0},result:1}];
 assert.equal(firstViolation(rule,seen),null);
 const altered=[...seen,{state:{A:1,B:1,C:1},result:1}];
 assert.equal(firstViolation(rule,altered),3);
});
