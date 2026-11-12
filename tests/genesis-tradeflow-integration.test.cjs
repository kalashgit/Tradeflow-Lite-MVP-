'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {createPreviewServer}=require('../scripts/local-ai-preview-server.cjs');
const SECRET='aion-synthetic-dev-only-secret';
async function withHost(options,fn){
 const {server,metrics}=createPreviewServer({secret:SECRET,...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const send=(body,headers={})=>fetch(base+'/api/ai/chat',{
  method:'POST',headers:{'content-type':'application/json',...headers},
  body:JSON.stringify(body)});
 try{await fn({base,send,metrics});}finally{await new Promise(resolve=>server.close(resolve));}
}
const MSG={role:'user',content:'How do I improve margins on commercial electrical jobs?'};
test('the EXISTING TradeFlow UI contains an explicit AION mode, not a second disconnected app',()=>{
 const app=readFileSync(require.resolve('../public/app.js'),'utf8');
 const html=readFileSync(require.resolve('../public/index.html'),'utf8');
 assert.match(app,/tfAiGenesisToggle/);
 assert.match(app,/assistant:'genesis'/);
 assert.match(app,/AION Genesis · local Qwen selected/);
 assert.match(app,/genesis_qwen/);
 assert.match(html,/voice-command\.js/);
 assert.match(html,/ai-speech\.js/);
});
test('synthetic preview exposes AION knowledge coverage without leaking business records',async()=>{
 await withHost({mode:'mock'},async({base,send,metrics})=>{
  const health=await fetch(base+'/api/ai/health').then(r=>r.json());
  assert.equal(health.genesisPilot,true);
  assert.ok(health.genesisKnowledge.entries>=45);
  const refused=await send({code:'wrong',assistant:'genesis',messages:[MSG]});
  assert.equal(refused.status,401);
  const checked=await send({code:SECRET,assistant:'unknown',messages:[MSG]});
  assert.equal(checked.status,400);
  const reply=await send({code:SECRET,assistant:'genesis',messages:[MSG],
   business:{name:'PRIVATE_CUSTOMER',revenue:999999,contact:'PRIVATE_ADDRESS'},
   claimedTenant:'fake_company',role:'superadmin'});
  const data=await reply.json();
  assert.equal(reply.status,200);
  assert.equal(data.source,'genesis_reference');
  assert.match(data.reply,/Reference-only preview/);
  assert.equal(data.executionAuthority,false);
  assert.equal(data.companyRecordsRead,0);
  assert.equal(data.autonomousLearningActive,false);
  assert.equal(metrics.reads,0);assert.equal(metrics.writes,0);
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE_CUSTOMER|PRIVATE_ADDRESS|999999|fake_company/);
 });
});
test('AION live preview uses local Qwen with retrieval and real conversational text',async()=>{
 let modelPayload;
 await withHost({mode:'live',localFetch:async(url,options)=>{
  modelPayload=JSON.parse(options.body);
  return {ok:true,json:async()=>({choices:[{message:{content:'I would protect payroll cash first, then compare direct labor and material cost on each job against your estimate. What is your typical service mix?'},finish_reason:'stop'}]})};
 }},async({send,metrics})=>{
  const response=await send({code:SECRET,assistant:'genesis',messages:[
   {role:'user',content:'Help me run my electrical company more profitably.'},
   {role:'assistant',content:'Start with actual job costs and cash forecast.'},
   MSG
  ],business:{unapprovedFinancialAmount:9000000},role:'owner',businessId:'other'});
  const body=await response.json();
  assert.equal(body.source,'genesis_qwen');
  assert.equal(body.executionAuthority,false);
  assert.equal(body.companyRecordsRead,0);
  assert.match(body.reply,/payroll cash first/);
  assert.ok(body.knowledgeSources.some(x=>x.sourceTitle));
  assert.ok(modelPayload);
  assert.ok(modelPayload.messages.find(m=>m.role==='system').content.includes('AION Genesis'));
  assert.doesNotMatch(JSON.stringify(modelPayload),/9000000|unapprovedFinancialAmount/);
  assert.ok(!modelPayload.messages.some(m=>m.content.includes('\"businessId\":\"other\"')));
  assert.equal(metrics.writes,0);assert.equal(metrics.reads,0);
 });
});
test('AION live Qwen outage is clearly labeled unavailable, never a fabricated human answer',async()=>{
 await withHost({mode:'live',localFetch:async()=>{throw Error('Qwen offline')}},async({send,metrics})=>{
  const response=await send({code:SECRET,assistant:'genesis',messages:[MSG]});
  const data=await response.json();
  assert.equal(data.source,'genesis_unavailable');
  assert.match(data.reply,/could not complete/i);
  assert.equal(data.executionAuthority,false);
  assert.equal(metrics.writes,0);
 });
});
test('assistant mode cannot be invoked cross-origin',async()=>{
 await withHost({mode:'mock'},async({send})=>{
  const rejected=await send({code:SECRET,assistant:'genesis',messages:[MSG]},
   {Origin:'https://attacker.invalid'});
  assert.equal(rejected.status,403);
 });
});
