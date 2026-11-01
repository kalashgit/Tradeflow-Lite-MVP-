'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {completeLocal,endpointFor}=require('../src/local-ai-provider.cjs');
const msg=[{role:'user',content:'Synthetic briefing only'}];
test('disabled provider never fetches',async()=>{
 let called=false;
 const out=await completeLocal({messages:msg,fetchImpl:()=>{called=true;throw Error('should not call')}});
 assert.equal(out.status,'disabled');assert.equal(called,false);assert.equal(out.executionAuthority,false);
});
test('provider rejects non-loopback destinations',()=>{
 for(const url of ['https://example.com','http://10.0.0.1:8088','http://evil.com','http://user:pw@127.0.0.1:8088'])assert.throws(()=>endpointFor(url));
 assert.equal(endpointFor('http://127.0.0.1:8088'),'http://127.0.0.1:8088/v1/chat/completions');
});
test('localhost request disables thinking and does not issue business writes',async()=>{
 let request;
 const out=await completeLocal({enabled:true,messages:msg,fetchImpl:async(url,options)=>{
   request={url,options};return {ok:true,json:async()=>({choices:[{message:{content:'Review SYN-AR-02.'},finish_reason:'stop'}]})};
 }});
 assert.equal(out.status,'completed');assert.equal(out.answer,'Review SYN-AR-02.');
 assert.equal(out.untrusted,true);assert.equal(out.executionAuthority,false);
 assert.equal(request.options.method,'POST');assert.equal(JSON.parse(request.options.body).chat_template_kwargs.enable_thinking,false);
});
test('incomplete, empty, HTTP failure, transport failure return no trusted answer',async()=>{
 for(const [reply,status] of [
 [{ok:true,json:async()=>({choices:[{message:{content:'Partially done'},finish_reason:'length'}]})},'incomplete'],
 [{ok:true,json:async()=>({choices:[{message:{content:' '},finish_reason:'stop'}]})},'invalid_response'],
 [{ok:false,status:503},'unavailable']
 ]){const out=await completeLocal({enabled:true,messages:msg,fetchImpl:async()=>reply});assert.equal(out.status,status);assert.equal(out.answer,null);}
 const out=await completeLocal({enabled:true,messages:msg,fetchImpl:async()=>{throw Error('offline')}});
 assert.equal(out.status,'unavailable');assert.equal(out.executionAuthority,false);
});
test('invalid messages or budgets are rejected before transport',async()=>{
 await assert.rejects(completeLocal({enabled:true,messages:[{role:'system',content:''}],fetchImpl:async()=>{throw Error('network')}}));
 await assert.rejects(completeLocal({enabled:true,messages:msg,maxTokens:0}));
});
