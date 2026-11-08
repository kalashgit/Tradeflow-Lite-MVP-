/* TF-MI-CONV-01A — verified office blocker -> conversational answer adapter.
 * INTERNAL / NOT ROUTED. Reuses the role-scoped Intelligence review; never
 * accepts browser-supplied business records, writes chat, invokes a model,
 * prepares commands or claims persistent cloud conversation memory.
 */
import {AuthorizationError} from './tenant-security.js';
import {reviewOfficeJobBlocker} from './office-job-intelligence.js';

const questionValid=x=>typeof x==='string'&&x.trim().length>=3&&x.length<=300;
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};

// Deterministic intent classification is limited to this verified job-blocker
// workflow. Unrecognized requests must never become generic record access.
export function classifyOfficeBlockerQuestion(question){
 if(!questionValid(question))return null;
 const q=question.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ');
 if(/\b(ack|acknowledg\w*|received|confirmed|confirm|read)\b/.test(q)||
    /\b(has|did)\s+(the\s+)?crew\s+(see|ack|reply|respond)\b/.test(q))return 'crew_acknowledgment';
 if(/\b(office|coordinator|manager|response|responded|replied)\b/.test(q)&&
    /\b(say|said|reply|respond|response|message|tell|told|action|answer)\b/.test(q))
  return 'office_response';
 if(/\b(next|recommend|suggest|should|action|follow\s*up|handle|resolve|do)\b/.test(q)&&
    !/\b(block|blocker|blocking|stuck|problem|issue)\b/.test(q))return 'next_action';
 if(/\b(block|blocker|blocking|stuck|problem|issue|status|happening|progress)\b/.test(q))
  return 'job_blocker';
 return null;
}

function answerOf(intent,caseFile){
 const report=caseFile.report;
 const response=caseFile.roleExchange.officeResponse;
 const acknowledgment=caseFile.roleExchange.crewAcknowledgment;
 const jobId=caseFile.jobId;
 if(intent==='office_response'){
  return response.status==='not_recorded'?
   `No office response event is recorded for blocker ${report.eventId} on job ${jobId}. That does not establish whether anyone spoke outside TradeFlow.`:
   `An office response is recorded for job ${jobId}: “${response.text}” This is persisted job evidence, not proof of external message delivery or historical actor identity.`;
 }
 if(intent==='crew_acknowledgment'){
  return acknowledgment.status==='not_recorded'?
   `No crew acknowledgment event is recorded for blocker ${report.eventId} on job ${jobId}. Do not assume that the crew received or read a response.`:
   `A crew acknowledgment event is recorded for blocker ${report.eventId} on job ${jobId}. This establishes an event in the job record, not independently verified device delivery or job resolution.`;
 }
 if(intent==='next_action'){
  return caseFile.suggestedNextAction?
   (response.status==='not_recorded'?
    `Review the blocker on job ${jobId} with the crew and prepare an internal follow-up task. The delivery date, material requirements and schedule impact remain unverified.`:
    `An office response is recorded for job ${jobId}, but no crew acknowledgment is recorded. Review the response with the assigned technician; do not assume delivery or resolution.`):
   `The office response and crew acknowledgment events are recorded for job ${jobId}. No repeated blocker task is proposed. Confirm the actual material delivery and job resolution separately.`;
 }
 return caseFile.response.text;
}

/* The adapter consumes ONLY a server-authorized, current D1 evidence read.
 * The caller must authenticate the principal independently. The thread ID is
 * unverified client metadata and is never used to infer access or persistence.
 */
export async function answerOfficeBlockerQuestion({
 db,principal,businessId,jobId,eventId,threadId=null,question,
 expectedJobRevision=null
}={}){
 const intent=classifyOfficeBlockerQuestion(question);
 if(!intent)throw new AuthorizationError('Supported job blocker question required',400);
 const reviewed=await reviewOfficeJobBlocker({
  db,principal,businessId,jobId,eventId,threadId,expectedJobRevision
 });
 const observed=reviewed.source.revision;
 const evidence=[
  {recordType:'jobs',id:jobId,revision:observed,provenance:'authenticated_tenant_record'},
  {recordType:'jobs',id:jobId,revision:observed,eventId,
   provenance:'persisted_role_exchange_event'}
 ];
 if(reviewed.roleExchange.officeResponse.status!=='not_recorded')
  evidence.push({recordType:'jobs',id:jobId,revision:observed,
   eventId:reviewed.roleExchange.officeResponse.eventId,
   provenance:'persisted_role_exchange_event'});
 if(reviewed.roleExchange.crewAcknowledgment.status!=='not_recorded')
  evidence.push({recordType:'jobs',id:jobId,revision:observed,
   eventId:reviewed.roleExchange.crewAcknowledgment.eventId,
   provenance:'persisted_role_exchange_event'});
 return freeze({
  kind:'tradeflow.intelligence.conversation_reply.v1',
  status:'source_grounded_unsaved',mode:'deterministic_authenticated_evidence',
  intent,businessId:reviewed.businessId,jobId,
  thread:{id:threadId,bindingVerified:false,persistence:'not_saved',
   syncState:'not_synced'},
  assistantTurn:{
   role:'assistant',modality:'text',status:'proposed_not_persisted',
   source:'authenticated_record_evidence',content:answerOf(intent,reviewed),
   refs:evidence
  },
  source:{type:'jobs',id:jobId,revision:observed,
   access:reviewed.source.access,
   officeGrantRevision:reviewed.source.grantRevision},
  proposal:intent==='next_action'||intent==='job_blocker'?
   reviewed.suggestedNextAction:null,
  unknowns:reviewed.response.unknowns,
  memory:{status:'not_saved',reuseAsAuthoritativeFact:false},
  actorAttributionVerified:false,externalEffects:false,
  commandExecuted:false,executionAuthority:false
 });
}
