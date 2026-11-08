/* TF-MI-CONV-03 — user-controlled retention for signed-in conversation
 * copies. Reuses the existing aiConversationThreads/aiConversationTurns
 * stores and verified-account scope. No cloud deletion, model memory,
 * automatic cleanup, cross-account transfer or new storage.
 */
import {verifiedAccountConversationScope} from './conversation-evidence-bridge.js';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(x);
export function createVerifiedConversationRetention({
 db,store,readSession
}={}){
 if(!db?.transaction||!store?.listThreads||!store?.deleteThread||
    typeof readSession!=='function')
  throw Error('Existing local history store and signed-in session required');
 async function current(businessId){
  if(!id(businessId))throw Error('Valid selected business required');
  const state=await readSession(),identity=state?.identity;
  if(state?.status!=='signed_in'||!identity||
     !state.businesses?.some(b=>b.business_id===businessId&&
      ['owner','admin','member','viewer'].includes(b.role)))
   throw Error('Signed-in business membership required');
  const scope=await verifiedAccountConversationScope({
   issuer:identity.issuer,subject:identity.subject,businessId
  });
  return scope;
 }
 const checkStable=(a,b)=>{
  if(a.kind!==b.kind||a.businessId!==b.businessId||a.actorId!==b.actorId)
   throw Error('Account changed while managing local retention');
 };
 async function list(businessId){
  const before=await current(businessId);
  const threads=await store.listThreads(db,before);
  checkStable(before,await current(businessId));
  return Object.freeze(threads.map(t=>Object.freeze({
   id:t.id,title:t.title,updatedAt:t.updatedAt,syncState:'local_only'
  })));
 }
 async function deleteOne({businessId,threadId,confirmed=false}={}){
  if(confirmed!==true)throw Error('Explicit confirmation required');
  if(typeof threadId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(threadId))
   throw Error('Valid local conversation ID required');
  const before=await current(businessId);
  const available=await store.listThreads(db,before);
  if(!available.some(x=>x.id===threadId))
   throw Error('Conversation not found in this account scope');
  checkStable(before,await current(businessId));
  await store.deleteThread(db,before,threadId);
  return Object.freeze({status:'deleted_from_this_device',threadId,
   businessId,remoteDeleted:false,cloudMemoryDeleted:false});
 }
 async function deleteAll({businessId,confirmed=false}={}){
  if(confirmed!==true)throw Error('Explicit confirmation required');
  const before=await current(businessId);
  const threads=await store.listThreads(db,before);
  checkStable(before,await current(businessId));
  let removed=0;
  for(const t of threads){
   checkStable(before,await current(businessId));
   await store.deleteThread(db,before,t.id);
   removed++;
  }
  return Object.freeze({status:'deleted_local_account_history',
   businessId,deletedCount:removed,remoteDeleted:false,
   cloudMemoryDeleted:false});
 }
 return Object.freeze({list,deleteOne,deleteAll,
  retentionModel:'user_controlled_device_only',automaticRetention:false});
}
