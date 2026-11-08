const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/advisory-provider.js');
const context=()=>({kind:'tradeflow.intelligence.context.v1',businessId:'biz1',identity:{issuer:'issuer',subject:'user'},readOnly:true,executionAuthority:false,scope:{jobId:'job1'},records:[{type:'jobs',id:'job1',revision:2,record:{customerName:'SECRET NAME',amount:2000}}]});

test('advisory is disabled before transport is invoked',async()=>{
 const {requestAdvisory}=await load();let calls=0;
 await assert.rejects(requestAdvisory({context:context(),question:'Explain',transport:()=>{calls++}}),/disabled/);
 assert.equal(calls,0);
});
test('explicit mock advisory carries only provenance and grants no execution authority',async()=>{
 const {requestAdvisory}=await load();let seen;
 const result=await requestAdvisory({context:context(),question:'Explain labor uncertainty',enabled:true,transport:async payload=>(seen=payload,{text:'Potential causes require review'})});
 assert.equal(seen.protocol,'tradeflow.advisory.v1');
 assert.deepEqual(seen.evidence,[{type:'jobs',id:'job1',revision:2}]);
 assert.equal(JSON.stringify(seen).includes('SECRET NAME'),false);
 assert.equal(result.executionAuthority,false);
 assert.equal(result.requiresHumanReview,true);
});
test('reject forged context, excessive question, and malformed output',async()=>{
 const {requestAdvisory}=await load();const c=context();c.executionAuthority=true;
 await assert.rejects(requestAdvisory({context:c,question:'Why',enabled:true,transport:async()=>({text:'x'})}),/read-only context/);
 await assert.rejects(requestAdvisory({context:context(),question:'x'.repeat(501),enabled:true,transport:async()=>({text:'x'})}),/question/);
 await assert.rejects(requestAdvisory({context:context(),question:'Why',enabled:true,transport:async()=>({command:{execute:true}})}),/response/);
});
test('transport errors fail closed without exposing error contents',async()=>{
 const {requestAdvisory}=await load();
 await assert.rejects(requestAdvisory({context:context(),question:'Why',enabled:true,transport:async()=>{throw Error('SECRET TOKEN')}}),e=>e.message==='Advisory transport unavailable');
});
