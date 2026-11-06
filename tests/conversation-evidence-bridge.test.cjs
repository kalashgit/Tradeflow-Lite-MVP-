'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const store=require('../public/conversation-store.js');
const commands=require('../public/command-registry.js');
const {createDB}=require('./helpers/local-db.cjs');
let verifiedAccountConversationScope,createOfficeConversationEvidenceBridge;
const businessId='business_123',jobId='job_01',eventId='blocker_01';
const question='What is blocking this job?';
const revision=4,issuer='https://login.example.test',subject='office_01';
const proposal=()=>({
 status:'proposal_only',requiresHumanReview:true,commandId:'draft.prepare',
 params:{kind:'task',ref:{store:'jobs',id:jobId},
  title:'Review reported job blocker',fields:{title:'Review reported job blocker'}},
 boundToSourceRevision:revision
});
const response=(threadId)=>({
 kind:'tradeflow.intelligence.conversation_reply.v1',
 status:'source_grounded_unsaved',mode:'deterministic_authenticated_evidence',
 businessId,jobId,intent:'job_blocker',
 thread:{id:threadId,bindingVerified:false,persistence:'not_saved',syncState:'not_synced'},
 assistantTurn:{role:'assistant',modality:'text',
  status:'proposed_not_persisted',source:'authenticated_record_evidence',
  content:'A blocker is recorded; its effect on the schedule is unknown.',
  refs:[{recordType:'jobs',id:jobId,revision,
   provenance:'authenticated_tenant_record'},
   {recordType:'jobs',id:jobId,revision,eventId,
    provenance:'persisted_role_exchange_event'}]},
 source:{type:'jobs',id:jobId,revision,access:'authenticated_office_job_read'},
 proposal:proposal(),memory:{status:'not_saved',reuseAsAuthoritativeFact:false},
 commandExecuted:false,executionAuthority:false,externalEffects:false
});
before(async()=>({verifiedAccountConversationScope,createOfficeConversationEvidenceBridge}=
 await import('../public/conversation-evidence-bridge.js')));
async function fixture(){
 const db=createDB({},['aiConversationThreads','aiConversationTurns']);
 const scope=await verifiedAccountConversationScope({issuer,subject,businessId});
 let account={status:'signed_in',identity:{issuer,subject},
  businesses:[{business_id:businessId,role:'member'}]};
 const host={businessId,actorId:scope.actorId,screen:'ai',threadId:null,
  contextRecordId:jobId};
 const thread=await store.createThread(db,scope,'Missing materials');
 host.threadId=thread.id;
 const user=await store.appendTurn(db,scope,thread.id,{
  role:'user',source:'user',status:'committed',modality:'text',content:question});
 let reply=response(thread.id),reads=0,send;
 const bridge=createOfficeConversationEvidenceBridge({
  db,store,session:async()=>account,readHost:()=>({...host}),
  fetchOfficeReply:async input=>{reads++;send?.(input);return reply},
  definitions:commands.definitions
 });
 const args={businessId,jobId,eventId,threadId:thread.id,
  question,expectedJobRevision:revision};
 return {db,scope,host,thread,user,bridge,args,
  reads:()=>reads,setReply:value=>reply=value,setAccount:value=>account=value,
  onRead:fn=>send=fn};
}
test('authorized job evidence is copied to the existing thread without any business write',async()=>{
 const f=await fixture();
 const result=await f.bridge.attach(f.args);
 assert.equal(result.status,'saved_device_local_copy');
 assert.equal(result.localPersistence,'device_only');
 assert.equal(result.remoteThreadBindingVerified,false);
 assert.equal(result.clientCopyIsAuthorizationProof,false);
 assert.equal(result.serverContentRecheckRequired,true);
 assert.equal(result.executionAuthority,false);
 assert.equal(result.commandExecuted,false);
 assert.equal(result.receiptRef,null);
 assert.equal(result.sourceRevision,revision);
 assert.deepEqual(result.sourceRefs,['jobs:job_01@4']);
 assert.equal(result.proposal.commandId,'draft.prepare');
 assert.equal(result.proposal.status,'review_only_not_prepared');
 assert.equal(result.proposal.requiresHumanReview,true);
 assert.equal(result.proposal.executionAuthority,false);
 const turns=await store.listTurns(f.db,f.scope,f.thread.id);
 assert.equal(turns.length,2);
 assert.equal(turns[0].role,'user');
 assert.equal(turns[1].role,'assistant');
 assert.equal(turns[1].source,'authenticated_cloud_evidence');
 assert.equal(turns[1].content,'A blocker is recorded; its effect on the schedule is unknown.');
 assert.equal(turns[1].threadId,f.thread.id);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.proposal));
 assert.equal(f.db.dump().jobs.length,0);
 assert.equal(f.db.dump().commandLog.length,0);
 assert.equal(f.reads(),1);
 assert.equal((await store.listThreads(f.db,f.scope))[0].syncState,'local_only');
});
test('no original user turn, foreign account or changed job context means no server read',async()=>{
 const f=await fixture();
 const earlier=await store.createThread(f.db,f.scope,'Other');
 await assert.rejects(f.bridge.attach({...f.args,threadId:earlier.id}));
 assert.equal(f.reads(),0);
 f.host.contextRecordId='job_02';
 await assert.rejects(f.bridge.attach(f.args),/Conversation origin/);
 assert.equal(f.reads(),0);
 f.host.contextRecordId=jobId;
 f.setAccount({status:'signed_out',identity:{issuer,subject},
  businesses:[{business_id:businessId,role:'member'}]});
 await assert.rejects(f.bridge.attach(f.args),/Signed-in/);
 assert.equal(f.reads(),0);
});
test('account, thread, job changes during the server call cannot save the response',async()=>{
 for(const alter of [
  f=>{f.host.threadId='other_thread'},
  f=>{f.host.contextRecordId='job_02'},
  f=>{f.host.businessId='business_999'},
  f=>{f.setAccount({status:'signed_in',identity:{issuer,subject:'other_01'},
   businesses:[{business_id:businessId,role:'member'}]})}
 ]){
  const f=await fixture();
  f.onRead(()=>alter(f));
  await assert.rejects(f.bridge.attach(f.args),/Conversation origin|Account changed/);
  assert.equal((await store.listTurns(f.db,f.scope,f.thread.id)).length,1);
 }
});
test('conversation advancement while reading prevents inserting an answer into an obsolete context',async()=>{
 const f=await fixture();
 f.onRead(async()=>{});
 const original=f.bridge;
 const next=createOfficeConversationEvidenceBridge({
  db:f.db,store,session:async()=>({status:'signed_in',identity:{issuer,subject},
   businesses:[{business_id:businessId,role:'member'}]}),
  readHost:()=>({...f.host}),
  fetchOfficeReply:async()=>{await store.appendTurn(f.db,f.scope,f.thread.id,
   {role:'user',source:'user',status:'committed',content:'Another question'});
   return response(f.thread.id)},
  definitions:commands.definitions
 });
 await assert.rejects(next.attach(f.args),/advanced/);
 const turns=await store.listTurns(f.db,f.scope,f.thread.id);
 assert.deepEqual(turns.map(x=>x.role),['user','user']);
});
test('foreign source refs, changed revision, incorrect thread and fake execution are rejected',async()=>{
 const mutations=[
  r=>({...r,jobId:'job_02'}),
  r=>({...r,source:{...r.source,revision:5}}),
  r=>({...r,thread:{...r.thread,id:'other_thread'}}),
  r=>({...r,commandExecuted:true}),
  r=>({...r,assistantTurn:{...r.assistantTurn,
   refs:r.assistantTurn.refs.map(x=>({...x,id:'job_02'}))}}),
  r=>({...r,assistantTurn:{...r.assistantTurn,
   content:'Unbounded '.repeat(350)}})
 ];
 for(const mutate of mutations){
  const f=await fixture();
  f.setReply(mutate(response(f.thread.id)));
  await assert.rejects(f.bridge.attach(f.args));
  assert.equal((await store.listTurns(f.db,f.scope,f.thread.id)).length,1);
 }
});
test('registered draft is an inert suggestion; unregistered or unapproved commands are rejected',async()=>{
 for(const change of [
  {commandId:'invoice.send'},
  {requiresHumanReview:false},
  {status:'executed'},
  {boundToSourceRevision:10},
  {params:{...proposal().params,ref:{store:'jobs',id:'foreign'}}}
 ]){
  const f=await fixture();
  f.setReply({...response(f.thread.id),proposal:{...proposal(),...change}});
  await assert.rejects(f.bridge.attach(f.args),/unsupported or unreviewed command/);
  assert.equal((await store.listTurns(f.db,f.scope,f.thread.id)).length,1);
 }
 const f=await fixture();
 f.setReply({...response(f.thread.id),proposal:null});
 const result=await f.bridge.attach(f.args);
 assert.equal(result.proposal,null);
 assert.equal(result.commandExecuted,false);
});
test('storage failure retains original user turn and does not report assistant success',async()=>{
 const f=await fixture();
 f.db.failPutOnce=true;
 await assert.rejects(f.bridge.attach(f.args),/Simulated audit\/storage failure/);
 assert.equal((await store.listTurns(f.db,f.scope,f.thread.id)).length,1);
});
test('cloud actor scope digest never mixes subjects or issuers and never equals device-local scope',async()=>{
 const a=await verifiedAccountConversationScope({issuer,subject,businessId});
 const b=await verifiedAccountConversationScope({issuer:'https://other.example.test',subject,businessId});
 const c=await verifiedAccountConversationScope({issuer,subject:'office_02',businessId});
 assert.notEqual(a.actorId,b.actorId);
 assert.notEqual(a.actorId,c.actorId);
 assert.equal(a.actorId,(await verifiedAccountConversationScope({issuer,subject,businessId})).actorId);
 assert.notEqual(store.scopeKey(a),store.scopeKey({
  kind:'local',businessId,actorId:a.actorId
 }));
 await assert.rejects(verifiedAccountConversationScope({issuer,subject,businessId:'../bad'}));
});
