'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPreviewServer}=require('../scripts/local-ai-preview-server.cjs');
const secret='synthetic-dev-test-secret-only';
async function host(options,run){
 const {server,metrics}=createPreviewServer({secret,...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  const post=(path,body,headers={})=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  await run({origin,post,metrics});
 }finally{await new Promise(resolve=>server.close(resolve))}
}
const message={role:'user',content:'What should I prioritize today to improve profitability?'};
test('development chat starts locked, prevents anonymous data access and has no cloud APIs',async()=>{
 await host({},async({origin,post,metrics})=>{
  const no=await post('/api/ai/chat',{code:'wrong',messages:[message]});
  assert.equal(no.status,401);
  const verify=await post('/api/ai/verify',{code:secret});
  assert.equal(verify.status,200);
  assert.equal((await verify.json()).syntheticDemo,true);
  assert.equal((await fetch(origin+'/api/v1/businesses/anything/intelligence/context')).status,404);
  assert.equal((await fetch(origin+'/api/ai/health').then(r=>r.json())).modelMode,'mock');
  assert.equal(metrics.reads,0);
  assert.equal(metrics.writes,0);
 });
});
test('existing UI /api/ai/chat returns synthetic revision-backed citations via actual H04-01 read path',async()=>{
 await host({},async({origin,post,metrics})=>{
  const app=await fetch(origin+'/');
  assert.equal(app.status,200);
  assert.match(await app.text(),/TradeFlow Lite/);
  const js=await fetch(origin+'/app.js');
  assert.equal(js.status,200);
  assert.match(await js.text(),/tfAiAttribution/);
  const response=await post('/api/ai/chat',{code:secret,messages:[message],business:{customerName:'SHOULD NEVER REACH MODEL',amount:999999},role:'superadmin',businessId:'other_tenant'});
  assert.equal(response.status,200);
  const json=await response.json();
  assert.equal(json.source,'synthetic_mock');
  assert.equal(json.syntheticDemo,true);
  assert.equal(json.executionAuthority,false);
  assert.equal(json.readReverified,true);
  assert.ok(json.refs.includes('invoices:synthetic_invoice_01@1'));
  assert.equal(metrics.reads,2);
  assert.equal(metrics.writes,0);
  assert.doesNotMatch(JSON.stringify(json),/SHOULD NEVER REACH MODEL|999999|other_tenant/);
 });
});
test('local Qwen request receives ONLY synthetic allowlisted evidence',async()=>{
 let payload;
 await host({mode:'live',localFetch:async(url,options)=>{
  assert.equal(new URL(url).hostname,'127.0.0.1');
  payload=JSON.parse(options.body);
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({answer:'Review synthetic invoice before claiming collection.',refs:['invoices:synthetic_invoice_01@1']})},finish_reason:'stop'}]})};
 }},async({post,metrics})=>{
  const response=await post('/api/ai/chat',{code:secret,messages:[message],business:{contact:'PRIVATE_CONTACT',amount:2500000}});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.source,'local_qwen');
  assert.equal(body.readReverified,true);
  assert.equal(metrics.reads,2);
  assert.equal(metrics.writes,0);
  assert.ok(payload);
  assert.equal(JSON.parse(payload.messages.find(x=>x.role==='user').content).evidence.synthetic,true);
  assert.doesNotMatch(JSON.stringify(payload),/PRIVATE_CONTACT|2500000|synthetic\.example/);
  assert.equal(payload.chat_template_kwargs.enable_thinking,false);
 });
});
test('Qwen failure returns visibly unavailable answer and no false citations or action',async()=>{
 await host({mode:'live',localFetch:async()=>{throw Error('model server offline')}},async({post,metrics})=>{
  const response=await post('/api/ai/chat',{code:secret,messages:[message]});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.source,'unavailable');
  assert.equal(body.executionAuthority,false);
  assert.deepEqual(body.refs,[]);
  assert.match(body.reply,/could not complete/i);
  assert.equal(metrics.writes,0);
 });
});
test('invalid content, cross-origin post and unsupported write are denied',async()=>{
 await host({},async({post,origin})=>{
  assert.equal((await post('/api/ai/chat',{code:secret,messages:[{role:'user',content:'x'}]})).status,400);
  assert.equal((await post('/api/ai/chat',{code:secret,messages:[message]},{Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await post('/api/v1/businesses/synthetic_business_01/records/jobs/j_01',{},{})).status,405);
  assert.equal((await fetch(origin+'/.env')).status,403);
 });
});

test('synthetic chat varies evidence-backed guidance for quote and labor questions',async()=>{
 await host({},async({post,metrics})=>{
  const quote=await post('/api/ai/chat',{code:secret,messages:[{role:'user',content:'Should I follow up the quote?'}]});
  const q=await quote.json();assert.equal(q.source,'synthetic_mock');
  assert.ok(q.refs.includes('quotes:synthetic_quote_01@2'));assert.match(q.reply,/quote/i);
  const cost=await post('/api/ai/chat',{code:secret,messages:[{role:'user',content:'How is our labor cost?'}]});
  const l=await cost.json();assert.ok(l.refs.includes('jobCosts:synthetic_cost_01@1'));
  assert.match(l.reply,/budget/i);assert.equal(metrics.writes,0);
  assert.equal(metrics.reads,4);
 });
});
