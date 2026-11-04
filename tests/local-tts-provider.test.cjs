'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createLocalTtsProvider,createSpeechTickets}=require('../src/local-tts-provider.cjs');
const {createPreviewServer}=require('../scripts/local-ai-preview-server.cjs');
test('speech disabled by default; no hidden browser/cloud/provider fallback',async()=>{const p=createLocalTtsProvider();assert.equal((await p.health()).status,'disabled');await assert.rejects(p.synthesize('Hello'),/unavailable/)});
test('missing, unpinned or relative model paths fail closed',async()=>{for(const config of [{provider:'fake'},{provider:'kokoro',voice:'am_michael',model:'/missing',voices:'/missing'},{provider:'kokoro',model:'weights.onnx',voice:'am_michael'}])assert.equal((await createLocalTtsProvider({config,python:'/usr/bin/python3'}).health()).ready,false)});
test('speech text is bounded and cancellation precedes startup',async()=>{const p=createLocalTtsProvider();await assert.rejects(p.synthesize('x'.repeat(2501)),/Invalid/);await assert.rejects(p.synthesize('hello',{signal:AbortSignal.abort()}),{name:'AbortError'})});
test('tickets bind exact server text, thread, turn, expiration and bounded retention',()=>{
 let at=1000;const t=createSpeechTickets({now:()=>at,ttlMs:100,max:2});const args={text:'Actual model answer',threadId:'thread_one',turnId:'turn_one'};
 const issued=t.issue(args);assert.equal(t.read(issued),args.text);
 for(const patch of [{threadId:'other'},{turnId:'other'},{textSha256:'0'.repeat(64)},{ticket:'forged'}])assert.equal(t.read({...issued,...patch}),null);
 assert.equal(t.issue({...args,threadId:'unsafe"'}),null);at=1100;assert.equal(t.read(issued),null);
 const a=t.issue(args);t.issue({...args,turnId:'two'});t.issue({...args,turnId:'three'});assert.equal(t.read(a),null);
});
async function withServer(options,fn){const {server}=createPreviewServer({secret:'private-test-only-token',...options});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port)}finally{await new Promise(r=>server.close(r))}}
const post=(base,path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('speech endpoints reject unauthenticated, cross-origin and arbitrary supplied text',async()=>{
 let calls=0;
 await withServer({speechProvider:{health:async()=>({ready:true}),synthesize:async()=>{calls++;throw Error()}}},async base=>{
  assert.equal((await post(base,'/api/ai/speech/health',{})).status,401);
  assert.equal((await post(base,'/api/ai/speech/health',{code:'private-test-only-token'},{Origin:'https://evil.invalid'})).status,403);
  assert.equal((await post(base,'/api/ai/speech/synthesize',{code:'private-test-only-token',text:'Say this invented outcome'})).status,403);
 });assert.equal(calls,0);
});
test('mock answers never acquire speech authority; genuine completed inference uses exact ticketed text',async()=>{
 const text='Check the material list before returning to the site.';let spoken=null;
 const localFetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:text},finish_reason:'stop'}]})});
 const speechProvider={health:async()=>({ready:true}),synthesize:async value=>{spoken=value;return {audio:Buffer.from('RIFFfakeWAVE'),provider:'test',textSha256:crypto.createHash('sha256').update(value).digest('hex')}}};
 for(const mode of ['mock','live'])await withServer({mode,localFetch:mode==='live'?localFetch:undefined,speechProvider},async base=>{
  const reply=await (await post(base,'/api/ai/chat',{code:'private-test-only-token',messages:[{role:'user',content:'Give practical tips for site visits'}],threadId:'thread_one',assistantTurnId:'turn_one'})).json();
  if(mode==='mock'){assert.equal(reply.speech,undefined);return}
  assert.equal(reply.reply,text);assert.ok(reply.speech);
  assert.equal((await post(base,'/api/ai/speech/synthesize',{code:'private-test-only-token',...reply.speech,threadId:'different'})).status,403);
  const audio=await post(base,'/api/ai/speech/synthesize',{code:'private-test-only-token',...reply.speech});assert.equal(audio.status,200);assert.equal(audio.headers.get('Content-Type'),'audio/wav');assert.equal(spoken,text);
 });
});
