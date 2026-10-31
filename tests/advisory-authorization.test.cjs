const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/advisory-server.js');
const context=()=>({kind:'tradeflow.intelligence.context.v1',businessId:'biz1',identity:{issuer:'auth',subject:'owner'},readOnly:true,executionAuthority:false,scope:{jobId:'job1'},records:[{type:'jobs',id:'job1',revision:1}]});
const principal={issuer:'auth',subject:'owner'};
const env={TF_ADVISORY_ENABLED:'true',TF_ADVISORY_PROVIDER:'mock'};
test('advisory requires server authorization before the mock transport',async()=>{
 const {requestServerAdvisory}=await load();let calls=0;
 const input={context:context(),principal,env,intent:'evidence_gaps',transport:()=>{calls++;return {text:'test'}}};
 await assert.rejects(requestServerAdvisory(input),e=>e.code==='authorization_required');
 await assert.rejects(requestServerAdvisory({...input,authorize:async()=>false}),e=>e.code==='authorization_denied');
 await assert.rejects(requestServerAdvisory({...input,authorize:async()=>1}),e=>e.code==='authorization_denied');
 assert.equal(calls,0);
});
test('authorization recheck suppresses output after role revocation',async()=>{
 const {requestServerAdvisory}=await load();let checks=0;
 await assert.rejects(requestServerAdvisory({context:context(),principal,env,intent:'cost_variance',transport:async()=>({text:'untrusted'}),authorize:async()=>++checks===1}),e=>e.code==='authorization_denied');
 assert.equal(checks,2);
});
test('authorization errors are masked and approved result stays non-executable',async()=>{
 const {requestServerAdvisory}=await load();const args={context:context(),principal,env,intent:'labor_variance',transport:async()=>({text:'Review required'})};
 await assert.rejects(requestServerAdvisory({...args,authorize:async()=>{throw Error('private credential')}}),e=>e.code==='authorization_denied'&&!e.message.includes('credential'));
 const seen=[];
 const result=await requestServerAdvisory({...args,authorize:async scoped=>{seen.push(scoped);return true}});
 assert.equal(seen.length,2);
 assert.deepEqual(seen[0].scope,{jobId:'job1'});
 assert.equal(Object.isFrozen(seen[0]),true);
 assert.equal(result.requiresHumanReview,true);
 assert.equal(result.executionAuthority,false);
});
