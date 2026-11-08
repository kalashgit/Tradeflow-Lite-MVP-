'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let createVerifiedConversationRetention;
before(async()=>({createVerifiedConversationRetention}=await import(
 '../public/verified-conversation-retention.js'
)));
const businessId='business_123',identity={issuer:'https://issuer.example',subject:'crew_01'};
function fixture(){
 let session={status:'signed_in',identity,businesses:[{business_id:businessId,role:'member'}]};
 const scopes=[],records=new Map(),deletes=[];
 const store={
  listThreads:async(_db,scope)=>{
   scopes.push(scope);
   return records.get(scope.actorId)||[];
  },
  deleteThread:async(_db,scope,id)=>{
   deletes.push({scope,id});
   records.set(scope.actorId,(records.get(scope.actorId)||[]).filter(t=>t.id!==id));
  }
 };
 const db={transaction(){}};
 const retention=createVerifiedConversationRetention({
  db,store,readSession:async()=>session
 });
 return {retention,setSession:x=>session=x,records,deletes,scopes,store,db};
}
test('explicit local account history retention lists and deletes only signed-in scope',async()=>{
 const f=fixture();
 assert.equal(f.retention.automaticRetention,false);
 assert.deepEqual(await f.retention.list(businessId),[]);
 const scope=f.scopes.at(-1);
 f.records.set(scope.actorId,[
  {id:'thread_01',title:'Job review',updatedAt:'2026-11-07',syncState:'local_only'},
  {id:'thread_02',title:'Follow up',updatedAt:'2026-11-07',syncState:'local_only'}
 ]);
 await assert.rejects(f.retention.deleteOne({businessId,threadId:'thread_01'}),
  /Explicit confirmation/);
 assert.equal(f.deletes.length,0);
 const result=await f.retention.deleteOne({businessId,threadId:'thread_01',confirmed:true});
 assert.equal(result.status,'deleted_from_this_device');
 assert.equal(result.remoteDeleted,false);
 assert.equal(result.cloudMemoryDeleted,false);
 assert.equal(f.deletes.length,1);
 assert.equal(f.deletes[0].scope.actorId,scope.actorId);
 assert.equal((await f.retention.list(businessId)).length,1);
 const all=await f.retention.deleteAll({businessId,confirmed:true});
 assert.equal(all.deletedCount,1);
 assert.equal((await f.retention.list(businessId)).length,0);
});
test('cross-account and signed-out sessions cannot enumerate or delete another account history',async()=>{
 const f=fixture();
 const initial=await f.retention.list(businessId);
 const actor=f.scopes.at(-1).actorId;
 f.records.set(actor,[{id:'thread_01',title:'Private',syncState:'local_only'}]);
 f.setSession({status:'signed_in',identity:{...identity,subject:'other_01'},
  businesses:[{business_id:businessId,role:'member'}]});
 assert.deepEqual(await f.retention.list(businessId),[]);
 await assert.rejects(f.retention.deleteOne({
  businessId,threadId:'thread_01',confirmed:true
 }),/not found/);
 assert.equal(f.deletes.length,0);
 f.setSession({status:'signed_out',identity,businesses:[]});
 await assert.rejects(f.retention.list(businessId),/Signed-in/);
 await assert.rejects(f.retention.deleteAll({businessId,confirmed:true}),/Signed-in/);
 assert.equal(f.deletes.length,0);
});
test('revoked membership or changed account during deletion stops the operation',async()=>{
 const f=fixture();
 await f.retention.list(businessId);
 const actor=f.scopes.at(-1).actorId;
 f.records.set(actor,[{id:'thread_01',title:'Sensitive'}]);
 f.setSession({status:'signed_in',identity,
  businesses:[{business_id:'business_999',role:'member'}]});
 await assert.rejects(f.retention.deleteOne({
  businessId,threadId:'thread_01',confirmed:true
 }),/membership/);
 assert.equal(f.deletes.length,0);
 const g=fixture();
 let calls=0;
 const changing=createVerifiedConversationRetention({
  db:g.db,store:g.store,readSession:async()=>{
   calls++;
   return {status:'signed_in',
    identity:calls>1?{...identity,subject:'other_01'}:identity,
    businesses:[{business_id:businessId,role:'member'}]};
  }
 });
 await assert.rejects(changing.list(businessId),/Account changed/);
});
test('retention never claims remote cloud or server memory deletion',async()=>{
 const f=fixture();
 await assert.rejects(f.retention.deleteAll({businessId,confirmed:false}));
 const r=await f.retention.deleteAll({businessId,confirmed:true});
 assert.deepEqual({remoteDeleted:r.remoteDeleted,cloudMemoryDeleted:r.cloudMemoryDeleted},
  {remoteDeleted:false,cloudMemoryDeleted:false});
 assert.equal(f.retention.retentionModel,'user_controlled_device_only');
});
