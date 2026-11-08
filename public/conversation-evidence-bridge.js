/* TF-MI-CONV-01B — device-local copy of current server job evidence into
 * TradeFlow's EXISTING conversation history. This is a presentation/persistence
 * adapter, NOT a cloud thread authority, transport, independent server
 * authentication, job writer, command planner, or new queue.
 *
 * The caller must wire fetchOfficeReply to an independently authenticated
 * server route when approved. A callback supplied by a browser does not itself
 * establish the historical origin of a server response. Saved copies must be
 * re-read from the server before future reasoning or command preparation.
 */
import {canonical,freeze} from './intelligence-evidence.js';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const validIdentity=i=>i&&typeof i.issuer==='string'&&i.issuer.trim()&&
 typeof i.subject==='string'&&i.subject.trim()&&i.subject.length<=200;
const enc=new TextEncoder();
async function sha256(value){
 if(!globalThis.crypto?.subtle)throw Error('Secure local scope digest unavailable');
 return Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',enc.encode(canonical(value)))),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function verifiedAccountConversationScope({issuer,subject,businessId}={}){
 if(!validIdentity({issuer,subject})||!id(businessId))
  throw Error('Current account and business required');
 return freeze({kind:'verified_account',businessId,
  actorId:'account_'+(await sha256([issuer,subject])).slice(0,40)});
}
function validateReply(r,{businessId,jobId,eventId,threadId,definitions}){
 if(!r||r.kind!=='tradeflow.intelligence.conversation_reply.v1'||
  r.status!=='source_grounded_unsaved'||r.mode!=='deterministic_authenticated_evidence'||
  r.businessId!==businessId||r.jobId!==jobId||
  r.thread?.id!==threadId||r.thread.bindingVerified!==false||
  r.thread.persistence!=='not_saved'||r.thread.syncState!=='not_synced'||
  r.source?.type!=='jobs'||r.source.id!==jobId||
  !Number.isSafeInteger(r.source.revision)||r.source.revision<1||
  r.source.access!=='authenticated_office_job_read'||
  r.commandExecuted!==false||r.executionAuthority!==false||
  r.externalEffects!==false||r.memory?.reuseAsAuthoritativeFact!==false||
  r.assistantTurn?.role!=='assistant'||r.assistantTurn.modality!=='text'||
  r.assistantTurn.status!=='proposed_not_persisted'||
  r.assistantTurn.source!=='authenticated_record_evidence'||
  typeof r.assistantTurn.content!=='string'||!r.assistantTurn.content.trim()||
  r.assistantTurn.content.length>2500)
  throw Error('Authenticated job readback contract or scope does not match');
 const refs=r.assistantTurn.refs;
 if(!Array.isArray(refs)||refs.length<2||refs.length>8||
  refs.some(x=>x?.recordType!=='jobs'||x.id!==jobId||
   x.revision!==r.source.revision||![
    'authenticated_tenant_record','persisted_role_exchange_event'
   ].includes(x.provenance)||x.eventId!==undefined&&!id(x.eventId))||
  !refs.some(x=>x.provenance==='authenticated_tenant_record')||
  !refs.some(x=>x.eventId===eventId&&
   x.provenance==='persisted_role_exchange_event'))
  throw Error('Job response lacks exact current event/revision evidence');
 let proposal=null;
 if(r.proposal!==null){
  const p=r.proposal,definition=definitions.find(x=>x.id===p?.commandId);
  if(!p||p.status!=='proposal_only'||p.requiresHumanReview!==true||
   p.commandId!=='draft.prepare'||definition?.effect!=='draft'||
   definition?.approval!=='review_on_save'||
   p.boundToSourceRevision!==r.source.revision||
   p.params?.kind!=='task'||p.params.ref?.store!=='jobs'||
   p.params.ref.id!==jobId||typeof p.params.title!=='string'||
   p.params.title.length>150)
   throw Error('Response attempted an unsupported or unreviewed command');
  proposal=freeze({status:'review_only_not_prepared',
   commandId:p.commandId,params:JSON.parse(JSON.stringify(p.params)),
   sourceRevision:r.source.revision,requiresHumanReview:true,
   receiptRef:null,executionAuthority:false});
 }
 return {proposal,refs:[...new Set(refs.map(x=>
  'jobs:'+x.id+'@'+x.revision))]};
}
export function createOfficeConversationEvidenceBridge({
 db,store,session,readHost,fetchOfficeReply,definitions
}={}){
 if(!db?.transaction||!store?.listTurns||!store?.appendTurn||
    !store?.scopeKey||typeof session!=='function'||
    typeof readHost!=='function'||typeof fetchOfficeReply!=='function'||
    !Array.isArray(definitions))
  throw Error('Existing conversation, authenticated session and job-read ports required');
 const current=async(businessId,threadId,jobId)=>{
  const auth=await session();
  const identity=auth?.identity;
  if(auth?.status!=='signed_in'||!validIdentity(identity)||
    !auth.businesses?.some(b=>b.business_id===businessId&&
       ['owner','admin','member'].includes(b.role)))
   throw Error('Signed-in business membership required');
  const scope=await verifiedAccountConversationScope({...identity,businessId});
  const host=readHost();
  if(host?.businessId!==businessId||host.actorId!==scope.actorId||
    host.threadId!==threadId||host.screen!=='ai'||
    host.contextRecordId!==jobId)
   throw Error('Conversation origin, account or job changed');
  return {scope,actor:{issuer:identity.issuer,subject:identity.subject}};
 };
 async function attach({businessId,jobId,eventId,threadId,question,
    expectedJobRevision=null}={}){
  if(!id(businessId)||!id(jobId)||!id(eventId)||!id(threadId)||
   typeof question!=='string'||!question.trim()||question.length>300||
   expectedJobRevision!==null&&(!Number.isSafeInteger(expectedJobRevision)||
    expectedJobRevision<1))
   throw Error('Specific persisted job question and source revision required');
  const before=await current(businessId,threadId,jobId);
  const turns=await store.listTurns(db,before.scope,threadId);
  const last=turns.at(-1);
  if(last?.role!=='user'||last.source!=='user'||last.status!=='committed'||
     last.content!==question.trim()||!id(last.id))
   throw Error('A matching committed user turn must exist in this thread');
  // The read port is expected to invoke the server's independently scoped
  // read, NOT the local response JSON or an LLM prompt.
  const response=await fetchOfficeReply({
   businessId,jobId,eventId,threadId,question,expectedJobRevision
  });
  const validated=validateReply(response,{businessId,jobId,eventId,
   threadId,definitions});
  const after=await current(businessId,threadId,jobId);
  if(canonical(before)!==canonical(after))
   throw Error('Account changed during job response read');
  const latest=await store.listTurns(db,before.scope,threadId);
  if(latest.at(-1)?.id!==last.id)
   throw Error('Conversation advanced during job evidence read');
  // Stable event ID makes same-turn delivery retries idempotent; a changed
  // answer for the same user/record revision triggers the existing
  // conflicting-event check instead of silently overwriting old evidence.
  const key='cloud_'+(await sha256([
   businessId,threadId,last.id,jobId,eventId,response.source.revision
  ])).slice(0,52);
  const saved=await store.appendTurn(db,before.scope,threadId,{
   id:key,role:'assistant',source:'authenticated_cloud_evidence',
   status:'committed',modality:'text',
   content:response.assistantTurn.content,refs:validated.refs
  });
  let originalThreadStillActive=true;
  try{const final=await current(businessId,threadId,jobId);
   originalThreadStillActive=canonical(final)===canonical(before);
  }catch{originalThreadStillActive=false}
  return freeze({status:originalThreadStillActive?'saved_device_local_copy':
    'saved_to_original_thread_after_origin_change',
   threadId,jobId,sourceRevision:response.source.revision,
   sourceTurnId:saved.id,sourceRefs:validated.refs,
   proposal:validated.proposal,
   localTurn:saved,localPersistence:'device_only',
   remoteThreadBindingVerified:false,serverContentRecheckRequired:true,
   clientCopyIsAuthorizationProof:false,commandExecuted:false,
   receiptRef:null,executionAuthority:false});
 }
 return freeze({attach});
}
