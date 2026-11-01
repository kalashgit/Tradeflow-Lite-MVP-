'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {adviseGenerally}=require('../src/local-ai-general-advice.cjs');
test('general strategy is disabled by default and reads no records',async()=>{
 let called=false;const r=await adviseGenerally({question:'How should I choose an ideal customer?',fetchImpl:()=>{called=true;throw Error('no')}});
 assert.equal(r.status,'disabled');assert.equal(called,false);
});
test('general advice request contains no business evidence and cannot execute',async()=>{
 let payload;
 const r=await adviseGenerally({enabled:true,question:'How do I target my ideal electrical customer for maximum profit?',fetchImpl:async(_,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'Compare margin, customer acquisition cost and repeat work.'},finish_reason:'stop'}]})}}});
 assert.equal(r.status,'completed');assert.equal(r.source,'general_advice');assert.deepEqual(r.refs,[]);
 assert.equal(r.executionAuthority,false);assert.equal(r.recordCount,0);
 assert.doesNotMatch(JSON.stringify(payload),/synthetic_invoice|customerName|tenant_record/);
 assert.match(JSON.stringify(payload),/ideal.customer/i);
});
test('unavailable and truncated models do not return general advice',async()=>{
 const fail=await adviseGenerally({enabled:true,question:'What is my ideal market?',fetchImpl:async()=>{throw Error('offline')}});
 assert.equal(fail.status,'unavailable');assert.equal(fail.answer,null);
 const truncated=await adviseGenerally({enabled:true,question:'What is my ideal market?',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'partial'},finish_reason:'length'}]})})});
 assert.equal(truncated.status,'incomplete');assert.equal(truncated.answer,null);
});
