/* TF-MI-LEARN-01 Phase B — deterministic first-pass prioritization and proposal preconditions.
 * No model, no permissions decisions, no invented exposure or confidence. Ties stay explicit.
 */
import {PROACTIVE_CASE_KIND,PROPOSAL_COMMANDS,DETECTORS,prepareInternalProposal} from './intelligence-proactive-cases.js';
import {strictFinancialDate} from './intelligence-financial-evidence.js';

const GOALS=Object.freeze({
 cash_review:[DETECTORS.invoiceDueDate,DETECTORS.cashCoverageGap],
 schedule_readiness:[DETECTORS.fieldBlocker,DETECTORS.crewConflict,DETECTORS.materialOrder],
 sales_follow_up:[DETECTORS.quoteFollowUp]
});
const WEIGHTS=Object.freeze({
 trust:{authorized_current_record:30,local_unconfirmed:10,synthetic:0},
 completeness:{complete:30,partial:10,unknown:0},
 severity:{urgent:40,attention:15,informational:0},
 conclusion:{needs_review:10,conditional_hypothesis:5,missing_data:0},
 dueState:{past_due:40,due_today:30,approaching:15},
 goal:10,sameSubjectRejected:-10,staleHours:-5
});
const valid=c=>c?.kind===PROACTIVE_CASE_KIND&&c.executionAuthority===false&&typeof c.caseId==='string'&&typeof c.tenantId==='string';
const iso=x=>{const t=Date.parse(x);if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(x)||!Number.isFinite(t))throw Error('ISO timestamp required');return t};

export function prioritizeCases({cases=[],now=new Date().toISOString(),goals=[],resolvedCaseIds=[],tenantId=null}={}){
 const at=iso(now);
 if(!Array.isArray(goals)||goals.some(g=>!GOALS[g]))throw Error('Unknown business goal; goals must be explicitly configured');
 const resolved=new Set(resolvedCaseIds),seen=new Set(),excluded=[],scored=[];
 for(const c of cases){
  if(!valid(c)){excluded.push({caseId:c?.caseId||null,reason:'invalid_or_authority_bearing_case'});continue}
  if(tenantId!==null&&c.tenantId!==tenantId){excluded.push({caseId:c.caseId,reason:'foreign_tenant'});continue}
  if(resolved.has(c.caseId)){excluded.push({caseId:c.caseId,reason:'already_resolved'});continue}
  if(!['candidate','review'].includes(c.status)){excluded.push({caseId:c.caseId,reason:'status:'+c.status});continue}
  if(Date.parse(c.expiresAt)<=at){excluded.push({caseId:c.caseId,reason:'expired'});continue}
  if(seen.has(c.dedupeKey)){excluded.push({caseId:c.caseId,reason:'duplicate_dedupe_key'});continue}
  seen.add(c.dedupeKey);
  const reasons=[];let score=0;
  const add=(points,label)=>{score+=points;reasons.push(label+(points>=0?' +':' ')+points)};
  add(WEIGHTS.trust[c.evidenceTrust]??0,'evidence_trust:'+c.evidenceTrust);
  add(WEIGHTS.completeness[c.completeness]??0,'completeness:'+c.completeness);
  add(WEIGHTS.conclusion[c.conclusion]??0,'conclusion:'+c.conclusion);
  add(WEIGHTS.severity[c.severity]??0,'severity:'+c.severity);
  const due=c.evidence?.dueState;
  if(due&&WEIGHTS.dueState[due]!==undefined){add(WEIGHTS.dueState[due],'verified_due_state:'+due);const days=Math.abs(Number(c.evidence.daysUntilDue));if(due==='past_due'&&Number.isFinite(days))add(Math.min(20,days),'days_past_due:'+days)}
  if(c.evidence?.followUpDue===true&&Number.isFinite(c.evidence.daysSinceLastTouch))add(Math.min(20,c.evidence.daysSinceLastTouch),'days_since_last_touch:'+c.evidence.daysSinceLastTouch);
  if(c.evidence?.acknowledgment==='none_recorded')add(40,'field_blocker_unacknowledged');
  if(c.evidence?.contactRestricted===true)reasons.push('customer_contact_restricted (no score change; internal only)');
  for(const g of goals)if(GOALS[g].includes(c.detectorId))add(WEIGHTS.goal,'explicit_goal:'+g);
  if(Array.isArray(c.learningHints)&&c.learningHints.some(h=>h.appliesTo==='same_subject'&&h.feedback==='rejected'))add(WEIGHTS.sameSubjectRejected,'owner_previously_rejected_same_subject');
  const ageHours=(at-Date.parse(c.observedAt))/3600000;if(ageHours>12)add(WEIGHTS.staleHours,'observed_over_12h_ago');
  reasons.push('financial_exposure:not_estimated','confidence:not_scored');
  scored.push({caseId:c.caseId,detectorId:c.detectorId,tenantId:c.tenantId,subjectKey:c.subjectKey??null,score,reasons,severity:c.severity,conclusion:c.conclusion});
 }
 scored.sort((a,b)=>b.score-a.score||a.caseId.localeCompare(b.caseId));
 let rank=0,previous=null;const ranked=[];
 for(let i=0;i<scored.length;i++){
  const s=scored[i];
  if(previous===null||s.score!==previous)rank=i+1;
  const tie=scored.some((o,j)=>j!==i&&o.score===s.score);
  ranked.push(Object.freeze({...s,rank,tie,uncertainty:tie?'equal_priority_unresolved':null}));
  previous=s.score;
 }
 return Object.freeze({kind:'tradeflow.intelligence.proactive.priority.v1',rankedAt:new Date(at).toISOString(),goals:[...goals],ranked:Object.freeze(ranked),excluded:Object.freeze(excluded),modelInvoked:false,executionAuthority:false});
}

/* Pre-proposal validation. Every check is reported; a proposal is prepared only when all pass. */
export function validateProposalPreconditions({caseFile,scope,commandCatalog,currentRefs=null,existingProposals=[],automationMode='advisory',due}={}){
 const checks={};
 const fail=(name,detail)=>{checks[name]={ok:false,detail}};
 const pass=name=>{checks[name]={ok:true}};
 if(!valid(caseFile)){fail('case_valid','invalid_case');return Object.freeze({status:'blocked',checks,proposal:null,executionAuthority:false})}
 pass('case_valid');
 const mapping=PROPOSAL_COMMANDS[caseFile.detectorId];
 const definition=mapping&&Array.isArray(commandCatalog)?commandCatalog.find(d=>d?.id===mapping.commandId):null;
 if(!mapping)fail('command_exists','no_internal_command_for_detector');else if(!definition)fail('command_exists','command_not_registered');else pass('command_exists');
 const role=scope?.mode==='local'?'owner':scope?.role;
 const actorSubject=scope?.mode==='local'?scope.actor:scope?.identity?.subject;
 if(!scope||scope.businessId!==caseFile.tenantId)fail('tenant_matches','scope_tenant_mismatch');else pass('tenant_matches');
 if(!['owner','admin'].includes(role))fail('actor_permitted','role_cannot_approve_internal_actions');
 else if(caseFile.actor?.subject!==actorSubject)fail('actor_permitted','case_actor_differs_from_current_actor');
 else pass('actor_permitted');
 if(caseFile.conclusion!=='needs_review'||caseFile.completeness!=='complete')fail('evidence_complete',caseFile.conclusion+'/'+caseFile.completeness);else pass('evidence_complete');
 if(caseFile.evidenceTrust!=='authorized_current_record')fail('evidence_trust','evidence_not_server_confirmed');else pass('evidence_trust');
 if(Array.isArray(currentRefs)){
  const current=new Map(currentRefs.map(r=>[r.type+':'+r.id,r]));
  const stale=caseFile.subjectRefs.find(r=>{const live=current.get(r.type+':'+r.id);return !live||(r.revision!==null&&live.revision!==r.revision)});
  if(stale)fail('revision_current','subject_changed_or_removed:'+stale.type+':'+stale.id);else pass('revision_current');
 }else fail('revision_current','current_revisions_not_supplied');
 if(definition){if(definition.approval===mapping.approval&&['explicit','review_on_save'].includes(definition.approval))pass('approval_mechanism');else fail('approval_mechanism','unexpected_approval:'+definition.approval)}
 else fail('approval_mechanism','command_unavailable');
 if(definition&&definition.effect!==mapping.effect)fail('external_effects','command_effect_changed:'+definition.effect);
 else if(definition&&!['modification','draft'].includes(definition.effect))fail('external_effects','non_internal_effect');
 else if(definition)pass('external_effects');else fail('external_effects','command_unavailable');
 if(!['advisory','assisted','full'].includes(automationMode))fail('automation_setting','unknown_automation_mode');else pass('automation_setting');
 const needsDue=caseFile.detectorId===DETECTORS.invoiceDueDate||caseFile.detectorId===DETECTORS.quoteFollowUp;
 if(needsDue&&strictFinancialDate(due)===null)fail('parameters_valid','follow_up_due_date_required');else pass('parameters_valid');
 if(mapping&&Array.isArray(existingProposals)&&existingProposals.some(p=>p?.caseId===caseFile.caseId&&p.commandId===mapping.commandId&&p.status!=='withdrawn'))fail('not_duplicate','proposal_already_exists_for_case');
 else if(!Array.isArray(existingProposals))fail('not_duplicate','existing_proposals_not_supplied');else pass('not_duplicate');
 const blocked=Object.values(checks).some(c=>!c.ok);
 let proposal=null;
 if(!blocked){
  proposal=prepareInternalProposal({caseFile,commandCatalog,due});
  if(proposal.status!=='proposed_not_authorized')fail('proposal_prepared',proposal.reason);else pass('proposal_prepared');
 }
 const stillBlocked=Object.values(checks).some(c=>!c.ok);
 return Object.freeze({status:stillBlocked?'blocked':'eligible',checks:Object.freeze(checks),
  proposal:stillBlocked?null:Object.freeze({...proposal,automationMode,delegationEligible:false,delegationNote:'Phase B prepares proposals only; approval and execution stay in the existing typed command runtime.'}),
  executionAuthority:false});
}
export {GOALS as PRIORITY_GOALS,WEIGHTS as PRIORITY_WEIGHTS};
