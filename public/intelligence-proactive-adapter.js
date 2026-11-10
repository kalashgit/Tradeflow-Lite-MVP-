/* TF-MI-LEARN-01 Phase B — adapter that lets the EXISTING Master Intelligence conversation present
 * proactive cases. It produces read-only assistant turns shaped for public/conversation-store.js
 * (sanitizeTurn) plus a separate in-memory case index for drill-through. It never saves anything,
 * never executes, and refuses to put synthetic or foreign-tenant cases into a real thread.
 *
 * X01 integration dependency: conversation-store SOURCES must include PROACTIVE_TURN_SOURCE
 * (one-line additive change, see docs/TF_MI_LEARN_01_PHASE_B.md). Until then the real store
 * rejects these turns, which is the intended fail-closed behaviour.
 */
import {PROACTIVE_CASE_KIND} from './intelligence-proactive-cases.js';

export const PROACTIVE_TURN_SOURCE='proactive_case_review';
export const TURN_LIMIT=6000,REF_LIMIT=8,CASE_LIMIT=5;
const valid=c=>c?.kind===PROACTIVE_CASE_KIND&&c.executionAuthority===false&&typeof c.tenantId==='string';
const safe=x=>typeof x==='string'?x.replace(/[^\x20-\x7E -￿]/g,' ').slice(0,400):'';
const refString=r=>`${r.type}:${r.id}@${r.revision===null||r.revision===undefined?0:r.revision}`;
const refOk=s=>/^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+@[0-9]+$/.test(s);

// Derive the conversation scope from the SAME scope the detectors validated; a browser-supplied label is not trusted.
export function conversationScopeFor(scope){
 if(scope?.mode==='local'&&scope.actor==='local-owner'&&scope.businessId==='local-business')return {kind:'local',businessId:scope.businessId,actorId:scope.actor};
 if(scope?.mode==='cloud'&&scope.identity?.issuer&&scope.identity?.subject&&['owner','admin','member'].includes(scope.role))return {kind:'verified_account',businessId:scope.businessId,actorId:scope.identity.subject};
 throw Error('Conversation scope cannot be derived from this evidence scope');
}
function line(c){
 const refs=c.subjectRefs.map(refString).join(', ');
 return [`• [${c.severity.toUpperCase()}] ${safe(c.explanation)}`,
  `  Sources: ${refs}. Evidence: ${c.evidenceTrust.replace(/_/g,' ')}; completeness ${c.completeness}${c.missingData.length?' (missing: '+c.missingData.join(', ')+')':''}.`,
  `  Analysis: ${c.conclusion==='needs_review'?'review recommended':c.conclusion==='missing_data'?'evidence incomplete, no conclusion':'conditional hypothesis'}. ${safe(c.recommendation)}`,
  c.unknowns.length?`  Unknown: ${c.unknowns.join(', ')}.`:'',
  c.proposals.length?`  Proposed (not executed): ${c.proposals.map(p=>p.commandId).join(', ')}.`:'  No action proposed.'].filter(Boolean).join('\n');
}
export function buildProactiveTurn({cases=[],scope,now=new Date().toISOString(),priority=null,title='Proactive review'}={}){
 const conversationScope=conversationScopeFor(scope);
 const at=Date.parse(now);if(!Number.isFinite(at))throw Error('ISO timestamp required');
 for(const c of cases){
  if(!valid(c))throw Error('Only valid proactive cases may be presented');
  if(c.tenantId!==conversationScope.businessId)throw Error('Case tenant does not match the conversation scope');
  if(c.evidenceTrust==='synthetic'&&conversationScope.kind!=='local')throw Error('Synthetic cases cannot enter an authenticated conversation');
  if(c.evidenceTrust==='authorized_current_record'&&conversationScope.kind!=='verified_account')throw Error('Authenticated cases cannot be presented in a device-local conversation');
  if(c.actor?.subject!==conversationScope.actorId)throw Error('Case was evaluated for a different actor');
 }
 const order=priority?.ranked?new Map(priority.ranked.map(r=>[r.caseId,r.rank])):null;
 const active=cases.filter(c=>['candidate','review'].includes(c.status)&&Date.parse(c.expiresAt)>at);
 const sorted=[...active].sort((a,b)=>order?(order.get(a.caseId)??1e9)-(order.get(b.caseId)??1e9)||a.caseId.localeCompare(b.caseId):a.caseId.localeCompare(b.caseId));
 const shown=sorted.slice(0,CASE_LIMIT),omitted=sorted.length-shown.length;
 const header=conversationScope.kind==='local'?'DEVICE-LOCAL PROACTIVE REVIEW (owner-entered records; not authenticated cloud evidence)':'PROACTIVE REVIEW — authorized current records';
 const body=shown.length?shown.map(line).join('\n'):'No open proactive cases for the records in scope. This is not a full audit.';
 const footer=['OBSERVED facts above come from recorded TradeFlow records with the listed revisions; ANALYSIS lines are TradeFlow’s interpretation.',
  omitted>0?`${omitted} further case${omitted===1?'':'s'} not shown; ask for the next proactive cases.`:'',
  'No record was changed, no message sent, no command executed. Any proposed step requires explicit approval through the existing command path.'].filter(Boolean).join('\n');
 let content=[header,title+' as of '+new Date(at).toISOString().slice(0,10)+':',body,footer].join('\n');
 if(content.length>TURN_LIMIT)content=content.slice(0,TURN_LIMIT-60)+'\n[truncated; ask for the remaining cases]';
 const refs=[...new Set(shown.flatMap(c=>c.subjectRefs.map(refString)))].filter(refOk).slice(0,REF_LIMIT);
 return Object.freeze({
  turn:Object.freeze({role:'assistant',content,modality:'text',status:'committed',source:PROACTIVE_TURN_SOURCE,refs}),
  conversationScope:Object.freeze(conversationScope),
  caseIndex:Object.freeze(shown.map(c=>Object.freeze({caseId:c.caseId,detectorId:c.detectorId,subjectKey:c.subjectKey??null,severity:c.severity,conclusion:c.conclusion,expiresAt:c.expiresAt,rank:order?.get(c.caseId)??null}))),
  omitted,executionAuthority:false,modelInvoked:false});
}
// Drill-through: read-only navigation to the real permitted records (existing record.open command, approval none).
export function drillThrough(caseFile,{commandCatalog}={}){
 if(!valid(caseFile))throw Error('Valid proactive case required');
 const def=Array.isArray(commandCatalog)?commandCatalog.find(d=>d?.id==='record.open'):null;
 if(!def||def.effect!=='navigation'||def.approval!=='none')return Object.freeze({status:'unsupported_capability',reason:'record.open_not_registered_or_contract_changed',targets:[]});
 return Object.freeze({status:'navigation_available',caseId:caseFile.caseId,
  targets:caseFile.subjectRefs.map(r=>Object.freeze({commandId:'record.open',params:{ref:{store:r.type,id:r.id}},revision:r.revision,label:r.type+':'+r.id})),
  note:'Opening a record re-checks permission in the existing runtime; this list is not authorization.',executionAuthority:false});
}
