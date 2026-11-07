'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const commands=require('../public/command-registry.js');
let createVerifiedIntelligenceHost,verifiedAccountConversationScope;
before(async()=>{
 ({createVerifiedIntelligenceHost}=await import('../public/verified-intelligence-host.js'));
 ({verifiedAccountConversationScope}=await import('../public/conversation-evidence-bridge.js'));
});
const businessId='business_123',jobId='job_01',eventId='event_01',threadId='thread_01';
const question='What is blocking this job?';
const identity={issuer:'https://identity.example.test',subject:'office_01'};
const sourceReply=()=>({
 kind:'tradeflow.intelligence.conversation_reply.v1',
 status:'source_grounded_unsaved',mode:'deterministic_authenticated_evidence',
 businessId,jobId,intent:'job_blocker',
 thread:{id:threadId,bindingVerified:false,persistence:'not_saved',syncState:'not_synced'},
 assistantTurn:{role:'assistant',modality:'text',status:'proposed_not_persisted',
  source:'authenticated_record_evidence',content:'Crew reported missing panels.',
  refs:[{recordType:'jobs',id:jobId,revision:4,provenance:'authenticated_tenant_record'},
   {recordType:'jobs',id:jobId,revision:4,provenance:'persisted_role_exchange_event',eventId}]},
 source:{type:'jobs',id:jobId,revision:4,access:'authenticated_office_job_read'},
 proposal:null,memory:{reuseAsAuthoritativeFact:false},
 commandExecuted:false,executionAuthority:false,externalEffects:false
});
async function fixture(){
 const scope=await verifiedAccountConversationScope({...identity,businessId});
 let session={status:'signed_in',identity,businesses:[{business_id:businessId,role:'member'}]};
 const host={screen:'ai',businessId,actorId:scope.actorId,threadId,
  contextRecordId:jobId};
 const saved=[],calls=[],deletes=[];
 const db={transaction(){}};
 const store={
  scopeKey:s=>JSON.stringify([s.kind,s.businessId,s.actorId]),
  createThread:async()=>({id:threadId}),
  appendTurn:async(_db,s,id,t)=>{
   assert.equal(s.actorId,scope.actorId);assert.equal(id,threadId);
   const record={id:t.id||'turn_'+(saved.length+1),threadId:id,order:saved.length+1,...t};
   if(saved.some(x=>x.id===record.id))throw Error('Duplicate turn');
   saved.push(record);
   return record;
  },
  listTurns:async(_db,s,id)=>s.actorId===scope.actorId&&id===threadId?[...saved]:[],
  listThreads:async()=>[{id:threadId,title:'Job blocker'}],
  deleteThread:async(_db,s,id)=>{deletes.push({scope:s,id});saved.length=0}
 };
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  return new Response(JSON.stringify(sourceReply()),{status:200,
   headers:{'Content-Type':'application/json'}});
 };
 const api=createVerifiedIntelligenceHost({db,store,definitions:commands.definitions,
  readSession:async()=>session,readHost:()=>({...host}),fetcher});
 return {api,scope,host,saved,calls,deletes,
  setSession:x=>session=x};
}
const args={businessId,jobId,eventId,threadId,question,expectedJobRevision:4};
test('signed-in Master Intelligence host can display authenticated job answer without local retention',async()=>{
 const f=await fixture();
 const result=await f.api.ask({...args,retainLocally:false});
 assert.equal(result.status,'display_only_not_saved');
 assert.equal(result.localPersistence,'none');
 assert.equal(result.commandExecuted,false);
 assert.equal(result.executionAuthority,false);
 assert.equal(f.saved.length,0);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].options.credentials,'same-origin');
 assert.equal(f.api.securityMode,'verified_account_only');
 assert.equal(f.api.cloudThreadPersistence,false);
});
test('opted-in signed-in thread saves user and source-grounded assistant without executing',async()=>{
 const f=await fixture();
 const result=await f.api.ask({...args,retainLocally:true});
 assert.equal(result.status,'saved_device_local_copy');
 assert.equal(f.saved.length,2);
 assert.deepEqual(f.saved.map(x=>x.role),['user','assistant']);
 assert.equal(f.saved[1].source,'authenticated_cloud_evidence');
 assert.equal(result.proposal,null);
 assert.equal(result.commandExecuted,false);
 assert.equal(result.executionAuthority,false);
 assert.equal(result.remoteThreadBindingVerified,false);
 const deleted=await f.api.retention.deleteOne({businessId,threadId,confirmed:true});
 assert.equal(deleted.status,'deleted_from_this_device');
 assert.equal(f.saved.length,0);
 assert.equal(f.deletes.length,1);
});
test('signed-out, wrong host, switched account and wrong business cannot reach the server',async()=>{
 for(const modify of [
  f=>f.setSession({status:'signed_out',businesses:[],identity}),
  f=>f.host.screen='jobs',
  f=>f.host.contextRecordId='job_02',
  f=>f.host.businessId='business_999',
  f=>f.host.actorId='local-owner',
  f=>f.setSession({status:'signed_in',identity:{...identity,subject:'other_01'},
   businesses:[{business_id:businessId,role:'member'}]})
 ]){
  const f=await fixture();modify(f);
  await assert.rejects(f.api.ask({...args,retainLocally:true}));
  assert.equal(f.saved.length,0);
  assert.equal(f.calls.length,0);
 }
});
test('failed remote answer cannot create a verified assistant turn',async()=>{
 const f=await fixture();
 // Force the transport failure by changing host after request is sent:
 f.host.screen='ai';
 const g=await fixture();
 g.host.threadId='different_thread';
 await assert.rejects(g.api.ask({...args,retainLocally:true}));
 assert.equal(g.saved.length,0);
 assert.equal(g.calls.length,0);
});
