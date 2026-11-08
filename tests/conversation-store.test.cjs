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
  {...base,content:'x'.repeat(6001)}, {...base,rawAudio:[1,2,3]},
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

test('private online preview uses valid persistent conversation source without synthetic offline reply',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
 assert.doesNotMatch(source,/source:'offline_notice'/);
 assert.doesNotMatch(source,/Online AI is disabled in this private offline preview/);
 assert.match(source,/source:payload.syntheticDemo/);
 assert.equal(store.sanitizeTurn({role:'assistant',content:'A verified general AI response',status:'committed',source:'unverified_model'}).source,'unverified_model');
});
