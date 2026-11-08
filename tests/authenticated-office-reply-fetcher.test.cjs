'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let createAuthenticatedOfficeReplyFetcher;
before(async()=>({createAuthenticatedOfficeReplyFetcher}=await import(
 '../public/authenticated-office-reply-fetcher.js'
)));
const details={businessId:'business_123',jobId:'job_01',eventId:'event_01',
 threadId:'thread_01',question:'What is blocking the job?',expectedJobRevision:4};
const answer=()=>({kind:'tradeflow.intelligence.conversation_reply.v1',
 status:'source_grounded_unsaved',businessId:details.businessId,
 jobId:details.jobId,thread:{id:details.threadId},
 commandExecuted:false,executionAuthority:false,source:{revision:4}});
test('authenticated office transport is same-origin read-only, cookie-scoped and no-store',async()=>{
 let calls=0;
 const read=createAuthenticatedOfficeReplyFetcher({fetcher:async(url,opts)=>{
  calls++;
  assert.match(url,/^\/api\/v1\/businesses\/business_123\/intelligence\/jobs\/job_01\/blockers\/event_01\/answer\?/);
  const p=new URL(url,'https://example.test').searchParams;
  assert.equal(p.get('question'),details.question);
  assert.equal(p.get('threadId'),details.threadId);
  assert.equal(p.get('expectedJobRevision'),'4');
  assert.equal(opts.method,'GET');
  assert.equal(opts.credentials,'same-origin');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.cache,'no-store');
  assert.deepEqual(opts.headers,{Accept:'application/json'});
  assert.equal(opts.headers.Authorization,undefined);
  return new Response(JSON.stringify(answer()),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 assert.deepEqual(await read(details),answer());
 assert.equal(calls,1);
});
test('denied login, redirect, expired account and malformed body cannot be considered a verified read',async()=>{
 for(const resp of [
  ()=>new Response('{}',{status:401,headers:{'Content-Type':'application/json'}}),
  ()=>({type:'opaqueredirect'}),
  ()=>new Response('not json',{status:200,headers:{'Content-Type':'text/html'}}),
  ()=>new Response('{invalid',{status:200,headers:{'Content-Type':'application/json'}}),
  ()=>new Response(JSON.stringify({...answer(),businessId:'business_999'}),{status:200,headers:{'Content-Type':'application/json'}}),
  ()=>new Response(JSON.stringify({...answer(),commandExecuted:true}),{status:200,headers:{'Content-Type':'application/json'}}),
  ()=>new Response(JSON.stringify({...answer(),source:{revision:3}}),{status:200,headers:{'Content-Type':'application/json'}})
 ]){
  const read=createAuthenticatedOfficeReplyFetcher({fetcher:async()=>resp()});
  await assert.rejects(read(details));
 }
});
test('invalid IDs, unknown origin and interrupted network reject without sending',async()=>{
 let calls=0;
 const read=createAuthenticatedOfficeReplyFetcher({fetcher:async()=>{calls++;throw Error('offline')}});
 for(const opts of [
  {...details,businessId:'../../cross-tenant'},
  {...details,jobId:'job/other'},
  {...details,question:'x'},
  {...details,expectedJobRevision:0},
  {...details,threadId:'../../other'}
 ])await assert.rejects(read(opts));
 assert.equal(calls,0);
 await assert.rejects(read(details),/unavailable/);
 assert.equal(calls,1);
});
