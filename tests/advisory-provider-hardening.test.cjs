const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/advisory-provider.js');
const context=()=>({kind:'tradeflow.intelligence.context.v1',businessId:'biz1',identity:{issuer:'i',subject:'s'},readOnly:true,executionAuthority:false,records:[{type:'job',id:'j1',revision:1}]});
test('reject duplicate evidence key, including conflicting revisions',async()=>{
 const {prepareAdvisoryRequest}=await load();const c=context();c.records.push({type:'job',id:'j1',revision:2});
 assert.throws(()=>prepareAdvisoryRequest({context:c,question:'Why?',enabled:true}),/duplicate/);
});
test('reject oversized evidence before invoking transport',async()=>{
 const {requestAdvisory}=await load();const c=context();c.records=Array.from({length:201},(_,i)=>({type:'job',id:`j${i}`,revision:1}));let calls=0;
 await assert.rejects(requestAdvisory({context:c,question:'Why?',enabled:true,transport:()=>{calls++}}),/Too many/);assert.equal(calls,0);
});
test('enforce response byte limits for multibyte output',async()=>{
 const {requestAdvisory}=await load();await assert.rejects(requestAdvisory({context:context(),question:'Why?',enabled:true,transport:async()=>({text:'😀'.repeat(1100)})}),/Invalid advisory response/);
});
