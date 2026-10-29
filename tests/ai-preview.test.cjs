'use strict';
const assert=require('node:assert/strict');
let called=0,model='';
const env={
 ASSETS:{fetch:async()=>new Response('Static app',{status:200})},
 AI:{run:async(name,input)=>{called++;model=name;assert.equal(input.messages.at(-1).content,'What should I do?');assert.ok(input.messages[0].content.includes('Opportunity Map screen'));return {response:'Review your active jobs.'}}},
 TF_AI_PREVIEW_TOKEN:'🔒Κωδικός-2026-⚡!user'
};
const makeVerify=(token)=>new Request('https://example.com/api/ai/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:token})});
const makeChat=(token)=>new Request('https://example.com/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:token,screen:'map',messages:[{role:'user',content:'What should I do?'}]})});
(async()=>{
 const {default:worker}=await import('../src/index.js');
 const health=await worker.fetch(new Request('https://example.com/api/ai/health'),env);
 assert.equal(health.status,200);
 assert.equal((await health.json()).secretConfigured,true);
 assert.equal((await worker.fetch(makeVerify('bad'),env)).status,401);
 assert.equal((await worker.fetch(makeVerify(env.TF_AI_PREVIEW_TOKEN+' '),env)).status,401,'Exact code required');
 const authorized=await worker.fetch(makeVerify(env.TF_AI_PREVIEW_TOKEN),env);
 assert.equal(authorized.status,200);
 assert.equal((await authorized.json()).authorized,true);
 assert.equal((await worker.fetch(makeChat('bad'),env)).status,401);
 assert.equal(called,0,'No inference when unauthorized');
 const success=await worker.fetch(makeChat(env.TF_AI_PREVIEW_TOKEN),env);
 assert.equal(success.status,200);
 assert.equal((await success.json()).reply,'Review your active jobs.');
 assert.equal(model,'@cf/meta/llama-3.1-8b-instruct-fast');
 assert.equal((await worker.fetch(new Request('https://example.com/app.js'),env)).status,200);
 const disabled=await worker.fetch(makeChat(env.TF_AI_PREVIEW_TOKEN),{...env,TF_AI_PREVIEW_TOKEN:''});
 assert.equal(disabled.status,503);
 assert.equal(called,1,'No calls when secret missing');
 console.log('PASS: Unicode and punctuation access codes, verification, inference, static assets');
})().catch(err=>{console.error(err);process.exitCode=1});
