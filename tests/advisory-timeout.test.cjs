const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/advisory-provider.js');
const context=()=>({kind:'tradeflow.intelligence.context.v1',businessId:'biz1',identity:{issuer:'i',subject:'s'},readOnly:true,executionAuthority:false,records:[{type:'job',id:'j1',revision:1}]});
test('mock transport timeout signals cancellation and fails closed',async()=>{
 const {requestAdvisory}=await load();let signal;
 await assert.rejects(requestAdvisory({context:context(),question:'Why?',enabled:true,timeoutMs:10,transport:(_,o)=>{signal=o.signal;return new Promise(()=>{})}}),e=>e.code==='advisory_timeout');
 assert.equal(signal.aborted,true);
});
test('invalid timeout rejects before any transport invocation',async()=>{
 const {requestAdvisory}=await load();let calls=0;
 for(const timeoutMs of [0,-1,10001,1.5,NaN,Infinity,'50']){
  await assert.rejects(requestAdvisory({context:context(),question:'Why?',enabled:true,timeoutMs,transport:()=>{calls++}}),e=>e.code==='invalid_timeout');
 }
 assert.equal(calls,0);
});
test('mock transport receives abort signal; successful response stays advisory only',async()=>{
 const {requestAdvisory}=await load();let passedSignal;
 const r=await requestAdvisory({context:context(),question:'Why?',enabled:true,timeoutMs:500,transport:async(p,{signal})=>{passedSignal=signal;return {text:'Unknown pending review'}}});
 assert.equal(passedSignal.aborted,false);
 assert.equal(r.executionAuthority,false);assert.equal(r.requiresHumanReview,true);
});
test('mock transport failure hides provider-supplied secret',async()=>{
 const {requestAdvisory}=await load();
 await assert.rejects(requestAdvisory({context:context(),question:'Why?',enabled:true,timeoutMs:500,transport:async()=>{throw new Error('secret-token-123')}}),e=>e.code==='advisory_unavailable'&&!e.message.includes('secret'));
});
