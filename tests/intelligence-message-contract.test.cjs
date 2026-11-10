'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

const cases=[2500,2501,3000,6000,6001];
const handlers=[
 {name:'configured default Worker',module:'../src/index.js',max:6000},
 {name:'isolated iPhone Worker',module:'../src/iphone-preview.js',max:6000}
];

async function invoke(handler,messages,{business,extraHeaders={}}={}){
 let inferenceCalls=0,received;
 const env={TF_AI_PREVIEW_TOKEN:'unit-only-token',AI:{run:async(_model,input)=>{
  inferenceCalls++;
  received=input.messages;
  return {response:'MOCK RESPONSE'};
 }}};
 const body={code:'unit-only-token',messages};
 if(business!==undefined)body.business=business;
 const request=new Request('https://example.test/api/ai/chat',{
  method:'POST',headers:{'Content-Type':'application/json',...extraHeaders},body:JSON.stringify(body)
 });
 const module=await import(handler.module);
 const response=await module.default.fetch(request,env);
 return {status:response.status,body:await response.json(),inferenceCalls,received};
}

for(const handler of handlers){
 for(const length of cases){
  test(`${handler.name} accepts/rejects ${length} chars without truncation`,async()=>{
   const input='A'.repeat(length);
   const result=await invoke(handler,[{role:'user',content:input}]);
   if(length<=handler.max){
    assert.equal(result.status,200);
    assert.equal(result.body.reply,'MOCK RESPONSE');
    assert.equal(result.inferenceCalls,1);
    assert.equal(result.received.at(-1).content.length,length);
    assert.equal(result.received.at(-1).content,input);
   }else{
    assert.equal(result.status,400);
    assert.equal(result.inferenceCalls,0);
   }
  });
 }
}

test('default Worker can transport all eight bounded turns without hidden whole-request clipping',async()=>{
 const messages=Array.from({length:8},(_,i)=>({role:i%2?'user':'assistant',content:String(i).repeat(6000)}));
 const result=await invoke(handlers[0],messages);
 assert.equal(result.status,200);
 assert.equal(result.inferenceCalls,1);
 assert.deepEqual(result.received.slice(1),messages);
});

test('default Worker still rejects excessive transport size before inference',async()=>{
 const result=await invoke(handlers[0],[{role:'user',content:'A'}],{extraHeaders:{'Content-Length':'54001'}});
 assert.equal(result.status,413);
 assert.equal(result.inferenceCalls,0);
});

test('default Worker measures real UTF-8 payload size even with a misleading short header',async()=>{
 const messages=Array.from({length:8},(_,i)=>({role:i%2?'user':'assistant',content:'💡'.repeat(3000)}));
 const result=await invoke(handlers[0],messages,{extraHeaders:{'Content-Length':'100'}});
 assert.equal(result.status,413);
 assert.equal(result.inferenceCalls,0);
});

test('isolated preview still refuses uploaded business context',async()=>{
 const result=await invoke(handlers[1],[{role:'user',content:'A'.repeat(3000)}],{business:{invoices:[{id:'not-real'}]}});
 assert.equal(result.status,400);
 assert.equal(result.inferenceCalls,0);
});
