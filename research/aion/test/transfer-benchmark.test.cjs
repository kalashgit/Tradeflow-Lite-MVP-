'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {consistentRules}=require('../src/research-gates.cjs');
const {qwenProvider,oracleProvider}=require('../src/provider.cjs');
const {VARIABLES,WORLDS,runTransferBenchmark}=require('../src/transfer-benchmark.cjs');
test('held-out four-switch worlds require switches absent from training worlds',()=>{
 assert.equal(VARIABLES.length,4);
 assert.equal(WORLDS.length,3);
 assert.ok(WORLDS.every(world=>world.initial.inputs.includes('D')&&world.changed.inputs.includes('D')));
});
test('deterministic exact-candidate controller solves held-out variable-count benchmark without model',async()=>{
 const oracle={kind:'oracle-simulator',async infer({observations,allowedSwitches}){
  assert.deepEqual(allowedSwitches,VARIABLES);
  return {rule:consistentRules(observations,allowedSwitches)[0],modelCalls:1};
 }};
 const result=await runTransferBenchmark(oracle);
 assert.equal(result.summary.realModelInference,false);
 assert.equal(result.summary.memoryEnabled,false);
 assert.equal(result.summary.operatorGeneralization,false);
 assert.equal(result.summary.meanTruthTableAccuracy,1);
 assert.equal(result.summary.phases,6);
});
test('Qwen provider prompts include D and accept new switch pairs without revealing hidden rule',async()=>{
 let seen;
 const qwen=qwenProvider({runtime:'llama.cpp',fetchImpl:async(_url,options)=>{
  seen=JSON.parse(options.body).messages;
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"op":"xor","inputs":["A","D"],"rationale":"observed dependence"}'}}]})};
 }});
 const out=await qwen.infer({allowedSwitches:VARIABLES,observations:[{state:{A:1,B:0,C:0,D:0},result:1}]});
 assert.deepEqual(out.rule,{op:'xor',inputs:['A','D']});
 assert.match(seen[0].content,/A, B, C, D/);
 assert.doesNotMatch(JSON.stringify(seen),/hiddenRule|initialRule|changedRule/);
});
test('invalid four-switch proposal is not silently substituted with the true rule',async()=>{
 const qwen=qwenProvider({runtime:'llama.cpp',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"op":"xor","inputs":["D","Z"]}'}}]})})});
 const out=await qwen.infer({allowedSwitches:VARIABLES,observations:[{state:{A:1,B:0,C:0,D:0},result:1}]});
 assert.equal(out.rule,null);
 assert.equal(out.invalidOutputKind,'invalid_rule');
});
