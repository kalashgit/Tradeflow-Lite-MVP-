'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const history=require('../public/conversation-store.js');
const registry=require('../public/command-registry.js');

let createSignedInJobBriefingPort,isActiveJobsWeekQuestion;
before(async()=>({
 createSignedInJobBriefingPort,isActiveJobsWeekQuestion
 }=await import('../public/signed-in-job-briefing.js')));

const businessId='business_123';
const identity={issuer:'https://example.test/issuer',subject:'owner_01'};
const question="Show me my active jobs and what's due this week.";
const updatedAt='2026-11-06T12:00:00.000Z';
const record=(type,id,revision,value)=>({
 type,id,revision,updatedAt,provenance:'tenant_record',
 contentTrust:'untrusted_record_content',record:value
});
function data(){
 return {
  kind:'tradeflow.intelligence.context.v1',businessId,
  identity:{...identity},scope:{company:true},
  permission:{role:'owner'},readOnly:true,executionAuthority:false,
  records:[
   record('jobs','job_airport',3,{title:'Airport TI',status:'In Progress',
    scheduledDate:'2026-11-07'}),
   record('jobs','job_warehouse',2,{title:'Warehouse Upgrade',status:'Planned'}),
   record('tasks','task_01',2,{title:'Prepare site materials',
    jobId:'job_airport',due:'2026-11-06',status:'Open'}),
   record('tasks','task_02',1,{title:'Supplier review',
    jobId:'job_warehouse',due:'2026-11-08',status:'Open'}),
   record('tasks','task_03',1,{title:'Next-week inspection',
    jobId:'job_warehouse',due:'2026-11-09',status:'Open'})
  ]
 };
}
function fixture(){
 let state={status:'signed_in',identity:{...identity},
  businesses:[{business_id:businessId,role:'owner'}]};
 let active='thread_01',fetches=0,sessionReads=0;
 const threads=[],turns=[],writes=[];
 const conversationStore={
  scopeKey:history.scopeKey,
  async listThreads(db,scope){
   return threads.filter(t=>t.scopeKey===history.scopeKey(scope));
  },
  async listTurns(db,scope,threadId){
   return turns.filter(t=>t.threadId===threadId&&t.scopeKey===history.scopeKey(scope));
  },
  async appendTurn(db,scope,threadId,turn){
   const safe=history.sanitizeTurn(turn);
   const key=history.scopeKey(scope);
   const existing=turns.find(t=>t.id===safe.id);
   if(existing){
    if(existing.threadId!==threadId||existing.content!==safe.content)
     throw Error('Conflicting reply turn ID');
    return existing;
   }
   const saved={...safe,scopeKey:key,threadId};
   writes.push(saved);turns.push(saved);return saved;
  }
 };
 let fetchResponse=()=>data(),onFetch=()=>{};
 const port=createSignedInJobBriefingPort({
  db:{},businessId,session:async()=>{sessionReads++;return structuredClone(state)},
  fetcher:async(url,options)=>{
   fetches++;onFetch(fetches);
   assert.equal(url,'/api/v1/businesses/'+businessId+'/intelligence/context');
   assert.equal(options.method,'GET');
   assert.equal(options.credentials,'same-origin');
   assert.equal(options.redirect,'manual');
   assert.equal(options.cache,'no-store');
   assert.equal(options.headers.Accept,'application/json');
   return Response.json(fetchResponse(fetches));
  },store:conversationStore,definitions:registry.definitions,
  readActiveThread:async()=>active,today:()=> '2026-11-06'
 });
 async function initialize(){
  const scope=await port.scope();
  const key=history.scopeKey(scope);
  threads.push({id:active,scopeKey:key,deletedAt:null});
  turns.push({id:'user_01',scopeKey:key,threadId:active,
   role:'user',source:'user',status:'committed',content:question});
  return scope;
 }
 return {port,initialize,threads,turns,writes,
  setState:s=>state=s,setActive:s=>active=s,
  setFetchResponse:f=>fetchResponse=f,setOnFetch:f=>onFetch=f,
  stats:()=>({fetches,sessionReads,writes:writes.length})
 };
}

test('one signed-in owner question reads current cloud records twice and saves a true local transcript',async()=>{
 const f=fixture(),scope=await f.initialize();
 const result=await f.port.answer({threadId:'thread_01',userTurnId:'user_01',question});
 assert.equal(result.kind,'tradeflow.intelligence.signed-in-job-briefing.v1');
 assert.equal(result.status,'saved_device_local');
 assert.equal(result.activeJobCount,1);
 assert.equal(result.unknownStatusCount,1);
 assert.equal(result.datedItemCount,3);
 assert.match(result.content,/Jobs explicitly marked active: 1/);
 assert.match(result.content,/Airport TI/);
 assert.match(result.content,/Prepare site materials.*due 2026-11-06/);
 assert.match(result.content,/scheduled 2026-11-07/);
 assert.doesNotMatch(result.content,/arrival tomorrow|quotation due|Next-week inspection|Supplier guaranteed/);
 assert.match(result.content,/cannot be confirmed/i);
 assert.deepEqual(result.scope,scope);
 assert.equal(result.persistence,'device_local_only');
 assert.equal(result.syncState,'not_synced');
 assert.equal(result.sourceContentChecked,true);
 assert.equal(result.executionAuthority,false);
 assert.equal(result.commandExecuted,false);
 assert.equal(result.actionReceiptRef,null);
 assert.equal(f.stats().fetches,2);
 assert.equal(f.stats().writes,1);
 const saved=f.writes[0];
 assert.equal(saved.id,result.replyTurnId);
 assert.equal(saved.role,'assistant');
 assert.equal(saved.source,'authenticated_cloud_evidence');
 assert.equal(saved.threadId,'thread_01');
 assert.ok(saved.refs.includes('jobs:job_airport@3'));
 assert.ok(saved.refs.includes('tasks:task_01@2'));
 assert.ok(!saved.content.includes('http'));
 assert.equal(result.proposals.length,2);
 assert.deepEqual(result.proposals.map(p=>p.commandId),['workspace.open','draft.prepare']);
 assert.deepEqual(result.proposals.map(p=>p.status),['proposed_not_executed','proposed_not_executed']);
 assert.equal(result.proposals[1].approval,'review_on_save');
 assert.ok(Object.isFrozen(result));
});

test('source tags and scope never convert a local transcript into cloud persistence authority',async()=>{
 const f=fixture(),scope=await f.initialize();
 assert.equal(scope.kind,'verified_account');
 assert.match(scope.actorId,/^acct_[a-f0-9]{64}$/);
 assert.ok(!scope.actorId.includes('https'));
 assert.notEqual(history.scopeKey(scope),history.scopeKey({
  kind:'local',businessId:'local-business',actorId:'local-owner'
 }));
 const clean=history.sanitizeTurn({role:'assistant',status:'committed',source:'authenticated_cloud_evidence',
  content:'Source has been observed, not synchronized',refs:['jobs:job_airport@3']});
 assert.equal(clean.source,'authenticated_cloud_evidence');
 assert.throws(()=>history.sanitizeTurn({...clean,source:'cloud_permission_granted'}));
 assert.equal(f.stats().writes,0);
});

test('unsupported requests do not fetch, fabricate a quote, or execute a command',async()=>{
 const f=fixture();await f.initialize();
 for(const q of ['Send the Friday quote','Pay the supplier now','Delete jobs','Open the invoices','']) {
  assert.equal(isActiveJobsWeekQuestion(q),false);
  await assert.rejects(f.port.answer({threadId:'thread_01',userTurnId:'user_01',question:q}),
   /Only active jobs/);
 }
 assert.equal(f.stats().fetches,0);
 assert.equal(f.stats().writes,0);
});

test('a mid-read source revision or field change aborts without saving an assistant reply',async()=>{
 for(const patch of [
  x=>{x.records[0].revision=4;return x},
  x=>{x.records[2].record.due='2026-11-08';return x},
  x=>{x.records.push(record('tasks','task_new',1,{
   title:'Added after first read',due:'2026-11-07',status:'Open'}));return x}
 ]){
  const f=fixture();await f.initialize();
  f.setFetchResponse(n=>n===1?data():patch(data()));
  await assert.rejects(f.port.answer({threadId:'thread_01',userTurnId:'user_01',question}),
   /changed during briefing/);
  assert.equal(f.stats().writes,0);
 }
});

test('foreign-tenant response, private field injection and network denial never enter saved history',async()=>{
 for(const failed of [
  x=>({...x,businessId:'business_999'}),
  x=>{x.records[0].record.privateRate=200;return x},
  x=>{x.records[0].revision=0;return x}
 ]){
  const f=fixture();await f.initialize();f.setFetchResponse(()=>failed(data()));
  await assert.rejects(f.port.answer({threadId:'thread_01',userTurnId:'user_01',question}));
  assert.equal(f.stats().writes,0);
 }
 const f=fixture();await f.initialize();
 f.setFetchResponse(()=>{throw Error('offline')});
 await assert.rejects(f.port.answer({threadId:'thread_01',userTurnId:'user_01',question}),/offline/);
 assert.equal(f.stats().writes,0);
});

test('role change or thread switch during retrieval cancels without cross-account saving',async()=>{
 const role=fixture();await role.initialize();
 role.setOnFetch(n=>{
  if(n===1)role.setState({status:'signed_in',identity:{...identity},
   businesses:[{business_id:businessId,role:'viewer'}]});
 });
 await assert.rejects(role.port.answer({
  threadId:'thread_01',userTurnId:'user_01',question
 }),/role changed|Account or role changed/i);
 assert.equal(role.stats().writes,0);
 const switched=fixture();await switched.initialize();
 switched.setOnFetch(n=>{if(n===1)switched.setActive('thread_02')});
 await assert.rejects(switched.port.answer({
  threadId:'thread_01',userTurnId:'user_01',question
 }),/Conversation switched/);
 assert.equal(switched.stats().writes,0);
});

test('wrong account thread, unsigned session and unsaved user question cannot read cloud records',async()=>{
 const wrong=fixture();await wrong.initialize();
 wrong.threads[0].scopeKey=history.scopeKey({kind:'local',
  businessId:'local-business',actorId:'local-owner'});
 await assert.rejects(wrong.port.answer({
  threadId:'thread_01',userTurnId:'user_01',question
 }),/conversation is unavailable/);
 assert.equal(wrong.stats().fetches,0);
 const loggedOut=fixture();await loggedOut.initialize();
 loggedOut.setState({status:'signed_out',identity:{...identity},businesses:[]});
 await assert.rejects(loggedOut.port.answer({
  threadId:'thread_01',userTurnId:'user_01',question
 }),/signed-in/);
 assert.equal(loggedOut.stats().fetches,0);
 const missing=fixture();await missing.initialize();
 await assert.rejects(missing.port.answer({
  threadId:'thread_01',userTurnId:'missing_turn',question
 }),/Current saved user question/);
 assert.equal(missing.stats().fetches,0);
});

test('old user message cannot be blindly replayed as another answered turn',async()=>{
 const f=fixture();await f.initialize();
 await f.port.answer({threadId:'thread_01',userTurnId:'user_01',question});
 await assert.rejects(f.port.answer({threadId:'thread_01',
  userTurnId:'user_01',question}),/Current saved user question/);
 assert.equal(f.stats().writes,1);
 assert.equal(f.stats().fetches,2);
});

test('the returned next steps are only real registered non-executed commands',async()=>{
 const f=fixture();await f.initialize();
 const result=await f.port.answer({threadId:'thread_01',userTurnId:'user_01',question});
 for(const proposed of result.proposals){
  const registered=registry.definitions.find(x=>x.id===proposed.commandId);
  assert.ok(registered);
  assert.equal(registered.effect,proposed.effect);
  assert.equal(registered.approval,proposed.approval);
  assert.equal(proposed.status,'proposed_not_executed');
 }
 assert.equal(result.proposalOnly,true);
 assert.equal(result.commandExecuted,false);
 assert.equal(result.executionAuthority,false);
});
