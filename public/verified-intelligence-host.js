/* TF-MI-CONV-04 — authenticated Master Intelligence host adapter.
 * Adapter for the CURRENT AI view, not a second chat service. Uses existing
 * account-session, conversation history, read-only blocker answer route, and
 * explicit retention. No local-owner history is promoted to a cloud identity.
 *
 * GUI integration must pass the real active signed-in host state. The adapter
 * never trusts a caller-supplied principal, role, command receipt or record.
 */
import {createAuthenticatedOfficeReplyFetcher} from './authenticated-office-reply-fetcher.js';
import {createOfficeConversationEvidenceBridge,
 verifiedAccountConversationScope} from './conversation-evidence-bridge.js';
import {createVerifiedConversationRetention} from './verified-conversation-retention.js';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
export function createVerifiedIntelligenceHost({
 db,store,definitions,readSession,readHost,fetcher
}={}){
 if(!db?.transaction||!store?.appendTurn||!store?.createThread||
    !store?.listTurns||!store?.listThreads||!store?.deleteThread||
    typeof readSession!=='function'||typeof readHost!=='function'||
    typeof fetcher!=='function'||!Array.isArray(definitions))
  throw Error('Existing verified-account conversation host ports required');
 const fetchOfficeReply=createAuthenticatedOfficeReplyFetcher({fetcher});
 const retention=createVerifiedConversationRetention({db,store,readSession});
 const bridge=createOfficeConversationEvidenceBridge({
  db,store,session:readSession,readHost,fetchOfficeReply,definitions
 });
 const active=async(businessId,threadId,jobId)=>{
  if(!id(businessId)||!id(threadId)||!id(jobId))
   throw Error('Current business, thread and job required');
  const s=await readSession();
  if(s?.status!=='signed_in'||!s.businesses?.some(b=>b.business_id===businessId&&
    ['owner','admin','member'].includes(b.role)))
   throw Error('Verified account and active business membership required');
  const scope=await verifiedAccountConversationScope({
   issuer:s.identity?.issuer,subject:s.identity?.subject,businessId
  });
  const host=readHost();
  if(host?.screen!=='ai'||host?.businessId!==businessId||
     host.actorId!==scope.actorId||host.threadId!==threadId||
     host.contextRecordId!==jobId)
   throw Error('Signed-in Master Intelligence host scope changed');
  return scope;
 };
 async function ask({businessId,jobId,eventId,threadId,question,
    expectedJobRevision=null,retainLocally=false}={}){
  if(!id(eventId)||typeof question!=='string'||!question.trim()||
     question.length>300||typeof retainLocally!=='boolean')
   throw Error('Supported job blocker request and explicit retention choice required');
  const scope=await active(businessId,threadId,jobId);
  if(!retainLocally){
   const data=await fetchOfficeReply({businessId,jobId,eventId,threadId,
    question,expectedJobRevision});
   const after=await active(businessId,threadId,jobId);
   if(store.scopeKey(scope)!==store.scopeKey(after))
    throw Error('Account changed during authenticated read');
   return Object.freeze({status:'display_only_not_saved',answer:data,
    commandExecuted:false,executionAuthority:false,localPersistence:'none',
    serverContentRecheckRequired:true});
  }
  // The user turn is committed to the existing *verified-account* IndexedDB
  // thread. If the remote read fails, that user turn remains with no fake
  // assistant answer; its retention remains user-controllable.
  await store.appendTurn(db,scope,threadId,{role:'user',source:'user',
   status:'committed',content:question.trim(),modality:'text'});
  return bridge.attach({businessId,jobId,eventId,threadId,
   question,expectedJobRevision});
 }
 return Object.freeze({
  ask,retention,
  securityMode:'verified_account_only',
  commandExecution:'disabled_in_this_adapter',
  cloudThreadPersistence:false
 });
}
