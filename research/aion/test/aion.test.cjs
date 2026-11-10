'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prediction,INPUTS,consistentCandidates,nextExperiment,ruleKey}=require('../src/world.cjs');
const {localEndpoint,oracleProvider,qwenProvider}=require('../src/provider.cjs');
const {runBenchmark}=require('../src/benchmark.cjs');
test('mechanism evaluator computes AND, OR and XOR truth tables',()=>{
 const a={op:'and',inputs:['A','B']},o={op:'or',inputs:['A','B']},x={op:'xor',inputs:['A','B']};
 assert.equal(INPUTS.reduce((s,r)=>s+prediction(a,r),0),2);
 assert.equal(INPUTS.reduce((s,r)=>s+prediction(o,r),0),6);
 assert.equal(INPUTS.reduce((s,r)=>s+prediction(x,r),0),4);
});
test('active experiments eliminate inconsistent hypotheses',()=>{
 const rule={op:'xor',inputs:['A','C']},obs=[];
 for(let i=0;i<5;i++){
  const state=nextExperiment(obs);assert.ok(state);
  obs.push({state,result:prediction(rule,state)});
 }
 assert.ok(consistentCandidates(obs).some(r=>ruleKey(r)===ruleKey(rule)));
 assert.equal(nextExperiment(obs)!==null,true);
});
test('local endpoint is loopback-only',()=>{
 assert.equal(localEndpoint(),'http://127.0.0.1:8088/v1/chat/completions');
 for(const s of ['https://localhost:8088','http://10.0.0.2:8088','http://example.com','http://user:pass@127.0.0.1:8088','http://localhost:8088/custom'])assert.throws(()=>localEndpoint(s));
});
test('Qwen probe verifies an actual model response and rejects fake readiness',async()=>{
 let requests=0;
 const provider=qwenProvider({runtime:'llama.cpp',fetchImpl:async(url,opts)=>{
  requests++;
  if(url.endsWith('/health'))return {ok:true,status:200};
  assert.equal(JSON.parse(opts.body).stream,false);
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"pong":true}'}}]})};
 }});
 assert.deepEqual(await provider.probe(),{kind:'live-qwen',runtime:'llama.cpp',ready:true,validatedCompletion:true});
 assert.equal(requests,2);
 const unavailable=qwenProvider({runtime:'llama.cpp',fetchImpl:async()=>{throw Error('offline')}});
 await assert.rejects(()=>unavailable.probe(),/not ready/);
});
test('Ollama adapter uses native readiness and real JSON inference, not a llama.cpp health check',async()=>{
 const calls=[];
 const provider=qwenProvider({runtime:'ollama',model:'qwen3:0.6b',baseUrl:'http://127.0.0.1:11434',fetchImpl:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/api/version'))return {ok:true,status:200};
  if(url.endsWith('/api/chat')){
   const body=JSON.parse(options.body);
   assert.equal(body.model,'qwen3:0.6b');
   assert.equal(body.think,false);
   assert.equal(body.format,'json');
   assert.equal(body.stream,false);
   return {ok:true,json:async()=>({message:{content:'{"pong":true}'},done:true,done_reason:'stop'})};
  }
  throw Error('Unexpected provider endpoint');
 }});
 assert.deepEqual(await provider.probe(),{kind:'live-qwen',runtime:'ollama',ready:true,validatedCompletion:true});
 assert.equal(calls.length,2);
 assert.match(calls[0].url,/\/api\/version$/);
 assert.match(calls[1].url,/\/api\/chat$/);
});
test('Ollama rejected responses do not silently pass',async()=>{
 assert.throws(()=>qwenProvider({runtime:'ollama',model:null}),/requires AION_MODEL_ID/);
 const provider=qwenProvider({runtime:'ollama',model:'qwen3:0.6b',fetchImpl:async()=>({ok:true,json:async()=>({message:{content:'{"pong":true}'},done:false})})});
 await assert.rejects(()=>provider.infer({observations:[]}),/incomplete/);
});
test('invalid or truncated Qwen rule is rejected (not auto-corrected into an oracle answer)',async()=>{
 const provider=qwenProvider({runtime:'llama.cpp',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'not-json'}}]})})});
 await assert.rejects(()=>provider.infer({observations:[{state:{A:0,B:0,C:0},result:0}]}),/not valid JSON/);
});
test('oracle benchmark passes only as simulated control; memory remains disabled',async()=>{
 const result=await runBenchmark(oracleProvider());
 assert.equal(result.summary.realModelInference,false);
 assert.equal(result.summary.memoryEnabled,false);
 assert.equal(result.summary.scenarioCount,3);
 assert.equal(result.summary.phases,6);
 assert.equal(result.summary.meanTruthTableAccuracy,1);
 assert.equal(result.summary.hypothesisConsistencyRate,1);
 assert.ok(result.summary.revisionCount>=1);
});
