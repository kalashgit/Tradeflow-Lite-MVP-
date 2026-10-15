
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('src/index.js','utf8').replace('export default','globalThis.previewWorker =');
const context={URL,Request,Response};
vm.runInNewContext(code,context,{filename:'src/index.js'});
const worker=context.previewWorker;
let called=0,model='';
const env={
 ASSETS:{fetch:async()=>new Response('Static app',{status:200})},
 AI:{run:async(name,input)=>{called++;model=name;assert.equal(input.messages.at(-1).content,'What should I do?');return {response:'Review your active jobs.'}}},
 TF_AI_PREVIEW_TOKEN:'preview-code-not-for-git'
};
const make=(token)=>new Request('https://example.com/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({messages:[{role:'user',content:'What should I do?'}]})});
(async()=>{
 assert.equal((await worker.fetch(make('bad'),env)).status,401);
 assert.equal(called,0,'No inference when unauthorized');
 const success=await worker.fetch(make(env.TF_AI_PREVIEW_TOKEN),env);
 assert.equal(success.status,200);
 assert.equal((await success.json()).reply,'Review your active jobs.');
 assert.equal(model,'@cf/meta/llama-3.1-8b-instruct-fast');
 assert.equal((await worker.fetch(new Request('https://example.com/app.js'),env)).status,200);
 const disabled=await worker.fetch(make(env.TF_AI_PREVIEW_TOKEN),{...env,TF_AI_PREVIEW_TOKEN:''});
 assert.equal(disabled.status,503);
 assert.equal(called,1,'No calls when secret missing');
 console.log('PASS: AI preview secret, inference, and static assets');
})().catch(err=>{console.error(err);process.exitCode=1});
