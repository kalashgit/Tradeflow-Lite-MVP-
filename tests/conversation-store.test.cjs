'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const store=require('../public/conversation-store.js');
const local={kind:'local',businessId:'local-business',actorId:'local-owner'};
test('conversation scope is exact and rejects missing identities',()=>{
 assert.equal(store.VERSION,10);
 assert.notEqual(store.scopeKey(local),store.scopeKey({...local,actorId:'other-owner'}));
 assert.notEqual(store.scopeKey(local),store.scopeKey({...local,businessId:'other-business'}));
 assert.notEqual(store.scopeKey(local),store.scopeKey({...local,kind:'verified_account'}));
 for(const bad of [{...local,actorId:''},{...local,businessId:'../x'},{...local,kind:'anything'},{...local,actorId:null},null])
  assert.throws(()=>store.scopeKey(bad),/scope/);
});
test('versioned migration creates only the two dedicated AI stores with indexes',()=>{
 const existing=new Set(['customers','quotes','jobs','settings']);
 const indices={};
 const db={
  objectStoreNames:{contains:name=>existing.has(name)},
  createObjectStore(name,options){
   assert.equal(options.keyPath,'id');existing.add(name);
   return {createIndex(index,key,options){assert.equal(options.unique,false);(indices[name]||=[]).push([index,key])}};
  }
 };
 store.upgrade(db);
 store.upgrade(db);
 assert.deepEqual(indices.aiConversationThreads,[['byScope','scopeKey']]);
 assert.deepEqual(indices.aiConversationTurns,[['byThread','threadId']]);
 assert.ok(existing.has('customers')&&existing.has('settings'));
});
test('only final bounded transcript text and labelled assistant replies are durable',()=>{
 const base={role:'user',modality:'voice',status:'committed',content:'Check the job',source:'user'};
 const valid=store.sanitizeTurn(base);
 assert.equal(valid.modality,'voice');
 assert.equal(valid.content,'Check the job');
 assert.equal(valid.status,'committed');
 assert.deepEqual(valid.refs,[]);
 const negatives=[
  {...base,status:'provisional'},{...base,status:'interrupted'}, {...base,content:'  '},
  {...base,content:'x'.repeat(2501)}, {...base,rawAudio:[1,2,3]},
  {...base,refs:['jobs:job01@2']},{...base,source:'general_advice'},
  {...base,role:'assistant',source:'user'}, {...base,id:'../bad'},
  {...base,refs:['fake-reference']}, {...base,modality:'not-a-modality'}
 ];
 for(const entry of negatives)assert.throws(()=>store.sanitizeTurn(entry),/turn|audio|evidence|event|modality/i);
 const reply=store.sanitizeTurn({role:'assistant',status:'committed',source:'synthetic_mock',
  content:'Synthetic evidence only',refs:['jobs:synthetic_job_01@1']});
 assert.equal(reply.source,'synthetic_mock');
 assert.equal(reply.refs[0],'jobs:synthetic_job_01@1');
});

const {createDB,put}=require('./helpers/local-db.cjs');
function contextFixture(){
 const db=createDB({},['aiConversationThreads','aiConversationTurns']);
 const thread={id:'thread_01',scopeKey:store.scopeKey(local),revision:3,deletedAt:null};
 const assistant={id:'turn_assistant',scopeKey:store.scopeKey(local),threadId:thread.id,role:'assistant',
  status:'committed',source:'device_local_evidence',refs:['jobs:job_01@0'],content:'Job review'};
 return {db,thread,assistant};
}
test('the saved job pointer is bound to a committed same-thread assistant source reference',async()=>{
 const f=contextFixture();
 await put(f.db,'aiConversationThreads',f.thread);await put(f.db,'aiConversationTurns',f.assistant);
 assert.equal(await store.readJobContext(f.db,local,f.thread.id),null);
 const pointer=await store.setJobContext(f.db,local,f.thread.id,{jobId:'job_01',sourceTurnId:'turn_assistant'});
 assert.deepEqual(pointer,{jobId:'job_01',sourceTurnId:'turn_assistant'});
 assert.deepEqual(await store.readJobContext(f.db,local,f.thread.id),{...pointer,trust:'device_local_pointer_only'});
 assert.equal(f.db.dump().jobs.length,0,'A pointer cannot change business records');
 await store.setJobContext(f.db,local,f.thread.id,null);
 assert.equal(await store.readJobContext(f.db,local,f.thread.id),null);
});
test('fake sources and changed actor or tenant cannot gain a remembered job',async()=>{
 const f=contextFixture();
 await put(f.db,'aiConversationThreads',f.thread);await put(f.db,'aiConversationTurns',f.assistant);
 for(const value of [{jobId:'other_job',sourceTurnId:'turn_assistant'},{jobId:'job_01',sourceTurnId:'missing'},{jobId:'../bad',sourceTurnId:'turn_assistant'}])
  await assert.rejects(()=>store.setJobContext(f.db,local,f.thread.id,value));
 await assert.rejects(()=>store.setJobContext(f.db,{...local,actorId:'foreign'},f.thread.id,{jobId:'job_01',sourceTurnId:'turn_assistant'}));
 await assert.rejects(()=>store.readJobContext(f.db,{...local,businessId:'foreign'},f.thread.id));
 await assert.rejects(()=>store.readJobContext(f.db,local,'missing'));
 await put(f.db,'aiConversationTurns',{...f.assistant,source:'synthetic_mock'});
 await assert.rejects(()=>store.setJobContext(f.db,local,f.thread.id,{jobId:'job_01',sourceTurnId:'turn_assistant'}));
});
test('missing, revoked and corrupted source turn invalidates job recovery on reload',async()=>{
 const f=contextFixture();
 await put(f.db,'aiConversationThreads',f.thread);await put(f.db,'aiConversationTurns',f.assistant);
 await store.setJobContext(f.db,local,f.thread.id,{jobId:'job_01',sourceTurnId:'turn_assistant'});
 await put(f.db,'aiConversationTurns',{...f.assistant,refs:['jobs:unrelated@0']});
 assert.equal(await store.readJobContext(f.db,local,f.thread.id),null);
 await put(f.db,'aiConversationThreads',{...f.thread,jobContext:{jobId:'job_01',sourceTurnId:'no_turn'}});
 assert.equal(await store.readJobContext(f.db,local,f.thread.id),null);
});
