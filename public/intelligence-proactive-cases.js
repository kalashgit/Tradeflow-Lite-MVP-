/* TF-MI-LEARN-01 Phase A — pure, read-only proactive TradeFlow Master Intelligence detectors.
 *
 * This module turns ALREADY-AUTHORIZED evidence (the existing bounded intelligence context and
 * the existing D01 financial evidence packet) into deduplicated, role-scoped, explainable
 * review CASES. It never reads IndexedDB or D1, never calls a model, never executes or
 * approves a command, and never treats a JSON field as a credential.
 *
 * Kinds are versioned and deliberately distinct from the existing owner-requested
 * `tradeflow.intelligence.case.v1` (public/intelligence-case.js) so the two contracts
 * cannot be confused.
 */
import {canonical,digest,freeze,validateEvidence} from './intelligence-evidence.js';
import {strictFinancialDate} from './intelligence-financial-evidence.js';

export const PROACTIVE_TRIGGER_KIND='tradeflow.intelligence.proactive.trigger.v1';
export const PROACTIVE_CASE_KIND='tradeflow.intelligence.proactive.case.v1';
export const LEARNING_KIND='tradeflow.intelligence.learning.v1';
export const PROACTIVE_CASE_TTL_MS=24*60*60*1000;
export const LEARNING_TTL_MS=90*24*60*60*1000;
export const DETECTORS=Object.freeze({
 invoiceDueDate:'invoice.due_date_review',          // O1 — P10/P11
 cashCoverageGap:'finance.cash_coverage_evidence_gap', // O2 — P52
 fieldBlocker:'job.field_blocker_unacknowledged',   // O3 — P14/P21 (Phase B, public/intelligence-proactive-operations.js)
 crewConflict:'job.crew_double_booking',            // O3 — P13/P26
 materialOrder:'job.material_order_review',         // O3 — P41/P42
 quoteFollowUp:'quotation.follow_up_review'         // O4 — P02/P33
});
// Internal, approval-gated command each detector may PROPOSE (never execute). Missing entry = no supported capability.
export const PROPOSAL_COMMANDS=Object.freeze({
 'invoice.due_date_review':{commandId:'invoice.followup.schedule',approval:'explicit',effect:'modification',requires:'past_due'},
 'quotation.follow_up_review':{commandId:'quotation.followup.schedule',approval:'explicit',effect:'modification',requires:'follow_up_due'},
 'job.field_blocker_unacknowledged':{commandId:'draft.prepare',approval:'review_on_save',effect:'draft',requires:'unacknowledged'}
});
const TRIGGER_SOURCES=Object.freeze({server_commit:'server_session',authorized_reconciliation:'authorized_service',local_pending:'local_only'});
const FINAL_INVOICE_STATES=new Set(['paid','recorded_paid','void','voided','cancelled','canceled','written_off','written off']);
const OPEN_INVOICE_STATES=new Set(['issued','sent','overdue','partial','partially_paid','partially paid','unpaid','open']);
const FEEDBACK=new Set(['accepted','corrected','rejected']);
const DAY=86400000;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const eventId=x=>typeof x==='string'&&/^[A-Za-z0-9:_.@|-]{1,200}$/.test(x); // existing domain events use colon-separated identifiers
const currencyCode=x=>typeof x==='string'&&/^[A-Z]{3}$/.test(x)?x:null; // untrusted record text is never echoed
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
const state=x=>String(x??'').trim().toLowerCase();
const refKey=r=>r.type+':'+r.id;
const shortHash=async value=>(await digest(value)).slice(0,24);
export const deny=(status,reason,extra={})=>freeze({status,reason,cases:[],unknowns:[],modelInvoked:false,executionAuthority:false,...extra});
export {id as validId,refKey,time as parseTime};
function safeNumber(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null}
function time(label,value){const t=Date.parse(value);if(!iso(value)||!Number.isFinite(t))throw Error(label+' must be an ISO timestamp');return t}

/* ---------------------------------------------------------------- triggers */
export function createTrigger({source,tenantId,eventId:eventIdentifier,recordRef,detectedAt}={}){
 if(!TRIGGER_SOURCES[source])throw Error('Unsupported trigger source');
 if(!id(tenantId)||!eventId(eventIdentifier))throw Error('Trigger tenant and event identifiers required');
 if(!recordRef||!id(recordRef.type)||!id(recordRef.id)||typeof recordRef.updatedAt!=='string')throw Error('Trigger record reference required');
 if(source==='local_pending'?recordRef.revision!==null:!Number.isSafeInteger(recordRef.revision)||recordRef.revision<1)throw Error('Trigger revision does not match its source');
 const at=time('detectedAt',detectedAt);
 // actorScope is DERIVED from the source; a caller-supplied value is never accepted.
 return freeze({kind:PROACTIVE_TRIGGER_KIND,version:1,tenantId,source,eventId:eventIdentifier,
  recordRef:{type:recordRef.type,id:recordRef.id,revision:recordRef.revision,updatedAt:recordRef.updatedAt},
  detectedAt:new Date(at).toISOString(),actorScope:TRIGGER_SOURCES[source],confirmed:source!=='local_pending',executionAuthority:false});
}
export function checkTrigger(trigger,tenantId){
 if(trigger==null)return null;
 if(trigger.kind!==PROACTIVE_TRIGGER_KIND||trigger.executionAuthority!==false||!TRIGGER_SOURCES[trigger.source]||trigger.actorScope!==TRIGGER_SOURCES[trigger.source])throw Error('Invalid proactive trigger');
 if(trigger.tenantId!==tenantId)throw Error('Trigger tenant does not match the evaluated scope');
 return trigger;
}

/* ------------------------------------------------------------- case shape */
export async function createProactiveCase({tenantId,detectorId,subjectRefs,evidenceTrust,completeness,missingData,severity,priorityReasons,conclusion,explanation,recommendation,unknowns,observedAt,dedupeKey,subjectKey=null,actor,jobId=null,trigger=null,evidence={},limitations=[]}){
 if(!['informational','attention','urgent'].includes(severity)||!['needs_review','missing_data','conditional_hypothesis'].includes(conclusion))throw Error('Invalid case severity or conclusion');
 const caseId='pcase_'+await shortHash(dedupeKey);
 return freeze({kind:PROACTIVE_CASE_KIND,version:1,caseId,tenantId,detectorId,subjectKey:subjectKey||dedupeKey.split('|')[2]||null,
  subjectRefs:[...subjectRefs].sort((a,b)=>refKey(a).localeCompare(refKey(b))),
  evidenceTrust,completeness,missingData:[...new Set(missingData)],status:'candidate',severity,priorityReasons:[...new Set(priorityReasons)],
  conclusion,explanation,recommendation,unknowns:[...new Set(unknowns)],limitations,evidence,
  actor:{subject:actor.subject,role:actor.role},jobId,triggerId:trigger?trigger.eventId:null,triggerSource:trigger?trigger.source:'on_open_or_reconnect',
  observedAt:new Date(observedAt).toISOString(),expiresAt:new Date(observedAt+PROACTIVE_CASE_TTL_MS).toISOString(),dedupeKey,
  proposals:[],learningHints:[],modelInvoked:false,executionAuthority:false,persistence:'in_memory_derived'});
}
export function actorOf(scope){return scope.mode==='local'?{subject:scope.actor,role:'owner'}:{subject:scope.identity.subject,role:scope.role}}
export function trustOf(scope,local,trigger){
 if(scope.synthetic===true){if(!/^sim_/.test(scope.businessId))throw Error('Synthetic evidence requires a sim_ tenant');return 'synthetic'}
 if(local||trigger?.source==='local_pending')return 'local_unconfirmed';
 return 'authorized_current_record';
}

/* --------------------------------------------- O1: invoice due-date review */
export async function detectInvoiceDueDateReview({context,scope,asOfDate,now=new Date().toISOString(),trigger=null,windowDays=7}={}){
 if(!scope||!id(scope.businessId))return deny('invalid','scope_required');
 if(!Number.isSafeInteger(windowDays)||windowDays<0||windowDays>60)return deny('invalid','invalid_window');
 const asOf=strictFinancialDate(asOfDate);if(asOf===null)return deny('invalid','invalid_or_ambiguous_date');
 let observedAt;try{observedAt=time('now',now)}catch{return deny('invalid','invalid_observation_time')}
 if(Array.isArray(context?.records)&&context.records.length>200)return deny('denied','bounded_snapshot_exceeded');
 let validated;
 try{validated=await validateEvidence(context,scope)}catch(error){return deny('denied','evidence_rejected',{detail:String(error.message).slice(0,120)})}
 let trig;try{trig=checkTrigger(trigger,scope.businessId)}catch(error){return deny('invalid','trigger_rejected',{detail:error.message})}
 const actor=actorOf(scope);
 if(!['owner','admin'].includes(actor.role))return deny('denied','finance_visibility_not_granted');
 let evidenceTrust;try{evidenceTrust=trustOf(scope,validated.local,trig)}catch(error){return deny('invalid','synthetic_scope_rejected',{detail:error.message})}
 const records=context.records,byKey=new Map(records.map(r=>[refKey(r),r]));
 const unknowns=[],cases=[];
 if(trig&&!byKey.has(refKey(trig.recordRef)))unknowns.push('trigger_record_absent_from_authorized_snapshot');
 if(trig&&byKey.has(refKey(trig.recordRef))&&trig.source!=='local_pending'&&byKey.get(refKey(trig.recordRef)).revision!==trig.recordRef.revision)unknowns.push('trigger_revision_differs_from_snapshot');
 const payments=records.filter(r=>r.type==='payments');
 for(const inv of records.filter(r=>r.type==='invoices')){
  const status=state(inv.record.status);
  if(!status){unknowns.push('invoice_status_unrecorded:'+inv.id);continue}
  if(FINAL_INVOICE_STATES.has(status))continue;
  if(!OPEN_INVOICE_STATES.has(status)){unknowns.push('invoice_status_unrecognized:'+inv.id);continue}
  const due=strictFinancialDate(inv.record.dueDate);
  if(due===null){unknowns.push('invoice_due_date_missing_or_invalid:'+inv.id);continue}
  const daysUntilDue=Math.round((due-asOf)/DAY);
  if(daysUntilDue>windowDays)continue;
  const dueState=daysUntilDue<0?'past_due':daysUntilDue===0?'due_today':'approaching';
  const missingData=[],subjectRefs=[{type:inv.type,id:inv.id,revision:inv.revision,updatedAt:inv.updatedAt??null}];
  let jobId=null;
  if(!id(inv.record.jobId))missingData.push('job_linkage');
  else if(!byKey.has('jobs:'+inv.record.jobId))missingData.push('linked_job_withheld_or_unavailable');
  else{jobId=inv.record.jobId;const job=byKey.get('jobs:'+jobId);subjectRefs.push({type:'jobs',id:jobId,revision:job.revision,updatedAt:job.updatedAt??null})}
  if(!id(inv.record.customerId))missingData.push('customer_linkage');
  const own=payments.filter(p=>p.record.invoiceId===inv.id);
  let recordedPaymentsTotal=0;for(const p of own){const amount=safeNumber(p.record.amount);if(amount===null){recordedPaymentsTotal=null;break}recordedPaymentsTotal+=amount;subjectRefs.push({type:p.type,id:p.id,revision:p.revision,updatedAt:p.updatedAt??null})}
  if(recordedPaymentsTotal===null)missingData.push('payment_amount_unreadable');
  if(evidenceTrust!=='authorized_current_record')missingData.push(evidenceTrust==='synthetic'?'synthetic_evidence_only':'server_confirmation_pending');
  const completeness=missingData.length?'partial':'complete';
  const conclusion=missingData.includes('job_linkage')||missingData.includes('linked_job_withheld_or_unavailable')||evidenceTrust!=='authorized_current_record'?'missing_data':'needs_review';
  const severity=dueState==='past_due'&&conclusion==='needs_review'?'attention':'informational';
  const priorityReasons=['invoice_due_state:'+dueState,'evidence_trust:'+evidenceTrust,'completeness:'+completeness];
  if(dueState==='past_due')priorityReasons.push('days_past_due:'+Math.abs(daysUntilDue));
  // Explanations use ONLY detector-owned wording and record identifiers; untrusted record text is never echoed.
  const explanation=`Invoice ${inv.id} (revision ${inv.revision??'local'}) has recorded status "${status}" and a recorded due date of ${inv.record.dueDate}, which is ${dueState.replace('_',' ')} as of ${asOfDate}. ${own.length} recorded payment ${own.length===1?'entry references':'entries reference'} it. Recorded status and payment entries are not independent settlement; no non-payment is asserted.`;
  const recommendation=conclusion==='needs_review'
   ?'Review the invoice due date and recorded payments in TradeFlow. Any internal follow-up task requires explicit approval through the existing command path; no customer contact is proposed.'
   :'Complete the missing linkage or confirm the evidence source before relying on this review; no action is proposed from incomplete evidence.';
  const dedupeKey=[scope.businessId,DETECTORS.invoiceDueDate,refKey(inv),inv.revision===null?'hash:'+inv.contentHash:'rev:'+inv.revision].join('|');
  cases.push(await createProactiveCase({tenantId:scope.businessId,detectorId:DETECTORS.invoiceDueDate,subjectRefs,evidenceTrust,completeness,missingData,severity,priorityReasons,conclusion,explanation,recommendation,
   unknowns:['settlement_not_verified','customer_payment_intent_unknown'],observedAt,dedupeKey,actor,jobId,trigger:trig,
   evidence:{dueDate:inv.record.dueDate,daysUntilDue,dueState,recordedStatus:status,recordedPaymentCount:own.length,recordedPaymentsTotal,settlementVerified:false,currency:currencyCode(inv.record.currency)},
   limitations:['Recorded invoice status and local payment entries are not bank or provider-confirmed settlement.','Bounded current snapshot; historical invoices outside the snapshot are not evaluated.']}));
 }
 return freeze({status:'evaluated',reason:null,detectorId:DETECTORS.invoiceDueDate,tenantId:scope.businessId,evidenceTrust,asOfDate,windowDays,
  evaluatedRecords:records.filter(r=>r.type==='invoices').length,cases,unknowns:[...new Set(unknowns)],complete:true,modelInvoked:false,executionAuthority:false});
}

/* --------------------------------------- O2: cash coverage evidence gap */
export async function detectCashCoverageEvidenceGap({packet,scope,asOfDate,now=new Date().toISOString()}={}){
 if(!scope||!id(scope.businessId))return deny('invalid','scope_required');
 if(scope.mode!=='cloud'||!scope.identity?.issuer||!scope.identity?.subject)return deny('denied','authenticated_cloud_scope_required');
 if(!['owner','admin'].includes(scope.role))return deny('denied','owner_or_admin_scope_required');
 let observedAt;try{observedAt=time('now',now)}catch{return deny('invalid','invalid_observation_time')}
 if(!packet||packet.kind!=='tradeflow.financial.evidence.v1'||packet.readOnly!==true||packet.executionAuthority!==false)return deny('invalid','financial_packet_required');
 if(packet.sourceKind!=='verified_tenant_record')return deny('denied','unverified_packet_source');
 const actor=packet.scope?.actor;
 if(packet.scope?.businessId!==scope.businessId)return deny('denied','packet_tenant_mismatch');
 if(actor?.issuer!==scope.identity.issuer||actor?.subject!==scope.identity.subject||actor?.role!==scope.role)return deny('denied','packet_actor_mismatch');
 if(strictFinancialDate(asOfDate)===null||packet.asOfDate!==asOfDate)return deny('invalid','as_of_mismatch_or_invalid');
 if(!Array.isArray(packet.recordRefs)||packet.recordRefs.length>200)return deny('invalid','packet_record_refs_invalid');
 for(const r of packet.recordRefs)if(!id(r?.type)||!id(r?.id)||!Number.isSafeInteger(r.revision)||r.revision<1||typeof r.updatedAt!=='string')return deny('invalid','packet_record_refs_invalid');
 const gaps=[];
 if(packet.status==='missing_data')gaps.push('packet_status_missing_data');
 if(packet.cash?.availableMinor===null||packet.cash?.availableMinor===undefined)gaps.push('cash_availability_unknown');
 if(packet.cash?.bankVerified!==true)gaps.push('bank_availability_unverified');
 if(packet.obligationsComplete!==true)gaps.push('obligations_incomplete');
 if(packet.receivables?.settlementVerified!==true)gaps.push('receivable_settlement_unverified');
 for(const [area,coverage]of Object.entries(packet.coverage||{}))if(coverage!=='complete')gaps.push('coverage:'+area+':'+String(coverage).slice(0,40));
 const declared=Array.isArray(packet.missingData)?packet.missingData.filter(x=>typeof x==='string'&&/^[a-z0-9_]{1,80}$/.test(x)):[];
 if(!gaps.length&&!declared.length)return freeze({status:'evaluated',reason:'no_evidence_gap_detected_forecast_not_supported',detectorId:DETECTORS.cashCoverageGap,tenantId:scope.businessId,cases:[],unknowns:['complete_packet_forecasting_not_implemented'],complete:true,modelInvoked:false,executionAuthority:false});
 const missingData=[...declared,...gaps];
 const subjectRefs=packet.recordRefs.map(r=>({type:r.type,id:r.id,revision:r.revision,updatedAt:r.updatedAt}));
 const dedupeKey=[scope.businessId,DETECTORS.cashCoverageGap,'asOf:'+asOfDate,'refs:'+await shortHash(canonical(subjectRefs.map(r=>refKey(r)+'@'+r.revision)))].join('|');
 const checklist=[
  declared.includes('verified_bank_availability')||gaps.includes('bank_availability_unverified')?'Confirm available bank balance from the bank, not from recorded invoices or payments.':null,
  declared.includes('payroll_schedule_and_taxes_benefits')?'Supply dated payroll amounts including taxes and benefits for the period '+(packet.period?.startDate||'?')+' to '+(packet.period?.endDate||'?')+'.':null,
  declared.includes('supplier_commitment_completeness')||declared.includes('materials_commitment_completeness')?'List committed supplier and material purchase orders with due dates.':null,
  declared.includes('collection_timing_and_settlement')?'Identify which open invoices have confirmed settlement timing.':null,
  declared.includes('business_time_zone')?'Set the business time zone so due dates are interpreted consistently.':null
 ].filter(Boolean);
 const c=await createProactiveCase({tenantId:scope.businessId,detectorId:DETECTORS.cashCoverageGap,subjectRefs,evidenceTrust:'authorized_current_record',completeness:subjectRefs.length?'partial':'unknown',missingData,
  severity:'attention',priorityReasons:['financial_evidence_incomplete','owner_only_evidence_collection','no_forecast_possible'],conclusion:'missing_data',
  explanation:`The authenticated financial evidence packet for ${asOfDate} (${packet.period?.startDate||'?'} to ${packet.period?.endDate||'?'}) lists ${subjectRefs.length} current financial record reference${subjectRefs.length===1?'':'s'} but reports status "${String(packet.status).slice(0,30)}": bank availability, payroll obligations and supplier commitments are not verified. No cash coverage number can be calculated.`,
  recommendation:'Collect the missing evidence before any cash or payroll conclusion: '+(checklist.length?checklist.join(' '):'see the listed missing data.')+' No forecast, payment, invoice or external contact is proposed.',
  unknowns:['cash_available','payroll_obligations','supplier_commitments','collection_timing'],observedAt,dedupeKey,actor:{subject:scope.identity.subject,role:scope.role},
  evidence:{period:packet.period?{startDate:packet.period.startDate,endDate:packet.period.endDate}:null,recordRefCount:subjectRefs.length,forecast:null,cashAvailableMinor:null,amountUnit:typeof packet.amountUnit==='string'?packet.amountUnit:null,evidenceChecklist:checklist},
  limitations:['Authenticated record identity is not verified financial settlement.','This finding is visible to owner and admin only and must not be summarized to other roles.']});
 return freeze({status:'evaluated',reason:null,detectorId:DETECTORS.cashCoverageGap,tenantId:scope.businessId,cases:[c],unknowns:[],complete:true,modelInvoked:false,executionAuthority:false});
}

/* ----------------------------------- dedupe, supersede, freshness, expiry */
export function subjectOf(c){if(typeof c.subjectKey==='string'&&c.subjectKey)return c.subjectKey;return c.detectorId===DETECTORS.cashCoverageGap?c.dedupeKey.split('|')[2]:refKey(c.subjectRefs.find(r=>r.type==='invoices')||c.subjectRefs[0])}
function validCase(c){return c?.kind===PROACTIVE_CASE_KIND&&c.executionAuthority===false&&id(c.tenantId)&&typeof c.dedupeKey==='string'&&c.dedupeKey.startsWith(c.tenantId+'|')&&Array.isArray(c.subjectRefs)}
export function reconcileCases({existing=[],evaluation,now=new Date().toISOString()}={}){
 const at=time('now',now);
 if(!evaluation||evaluation.status!=='evaluated'||!Array.isArray(evaluation.cases))throw Error('A completed detector evaluation is required');
 for(const c of [...existing,...evaluation.cases])if(!validCase(c))throw Error('Invalid proactive case in reconciliation');
 const active=[],superseded=[],notify=[];let suppressedDuplicates=0;
 const incomingBySubject=new Map(evaluation.cases.map(c=>[c.tenantId+'|'+c.detectorId+'|'+subjectOf(c),c]));
 const existingKeys=new Set(existing.map(c=>c.dedupeKey));
 for(const c of existing){
  const sameRun=c.tenantId===evaluation.tenantId&&c.detectorId===evaluation.detectorId;
  if(!sameRun){active.push(c);continue} // other tenants and detectors are never touched by this run
  if(c.status!=='candidate'&&c.status!=='review'){active.push(c);continue}
  if(Date.parse(c.expiresAt)<=at){superseded.push(freeze({...c,status:'superseded',supersedeReason:'expired',supersededBy:null}));continue}
  const incoming=incomingBySubject.get(c.tenantId+'|'+c.detectorId+'|'+subjectOf(c));
  if(incoming&&incoming.dedupeKey===c.dedupeKey){active.push(c);suppressedDuplicates++;continue}
  if(incoming){superseded.push(freeze({...c,status:'superseded',supersedeReason:'source_revision_changed',supersededBy:incoming.caseId}));continue}
  if(evaluation.complete===true){const resolved=Array.isArray(evaluation.resolvedSubjects)?evaluation.resolvedSubjects.find(r=>r?.subjectKey===subjectOf(c)):null;superseded.push(freeze({...c,status:'superseded',supersedeReason:resolved?'resolved:'+String(resolved.reason).slice(0,40):'record_absent_or_resolved',supersededBy:null}));continue}
  active.push(c);
 }
 for(const c of evaluation.cases){
  if(existingKeys.has(c.dedupeKey))continue;
  active.push(c);notify.push(c.caseId);
 }
 return freeze({active,superseded,newCaseIds:notify,suppressedDuplicates,executionAuthority:false});
}
export function inspectProactiveCase({caseFile,scope,now=new Date().toISOString(),currentRefs=null}={}){
 if(!validCase(caseFile))return {status:'invalid_case'};
 if(!scope||scope.businessId!==caseFile.tenantId)return {status:'scope_changed'};
 const role=scope.mode==='local'?'owner':scope.role;
 if(!['owner','admin'].includes(role))return {status:'access_denied'};
 const at=Date.parse(now),opened=Date.parse(caseFile.observedAt),expires=Date.parse(caseFile.expiresAt);
 if(!Number.isFinite(at)||!Number.isFinite(opened)||!Number.isFinite(expires)||expires-opened!==PROACTIVE_CASE_TTL_MS||at<opened)return {status:'invalid_time'};
 if(at>=expires)return {status:'expired'};
 if(Array.isArray(currentRefs)){
  const current=new Map(currentRefs.map(r=>[refKey(r),r]));
  for(const ref of caseFile.subjectRefs){const live=current.get(refKey(ref));if(!live)return {status:'stale_evidence',reason:'subject_absent'};if(ref.revision!==null&&live.revision!==ref.revision)return {status:'stale_evidence',reason:'revision_changed'}}
 }
 return {status:'current',executionAuthority:false};
}

/* --------------------------------------------------- internal proposals */
export function prepareInternalProposal({caseFile,commandCatalog,due}={}){
 if(!validCase(caseFile))throw Error('Valid proactive case required');
 const unsupported=(commandId,reason)=>freeze({proposalId:'proposal_'+caseFile.caseId.slice(6,22)+'_'+(commandId||'none').replace(/[^a-z0-9]/gi,'_'),caseId:caseFile.caseId,commandId:commandId||null,params:null,status:'unsupported_capability',reason,requiresApproval:true,externalEffects:false,receiptRef:null,executed:false,executionAuthority:false});
 if(caseFile.detectorId===DETECTORS.cashCoverageGap)return unsupported(null,'no_internal_command_for_evidence_collection');
 if(caseFile.detectorId===DETECTORS.crewConflict)return unsupported(null,'no_internal_command_for_schedule_change');
 if(caseFile.detectorId===DETECTORS.materialOrder)return unsupported(null,'no_internal_command_for_material_review');
 const mapping=PROPOSAL_COMMANDS[caseFile.detectorId];
 if(!mapping)return unsupported(null,'unknown_detector');
 const {commandId}=mapping;
 const definition=Array.isArray(commandCatalog)?commandCatalog.find(d=>d?.id===commandId):null;
 if(!definition)return unsupported(commandId,'command_not_registered');
 if(definition.approval!==mapping.approval||definition.effect!==mapping.effect)return unsupported(commandId,'command_contract_changed');
 if(caseFile.conclusion!=='needs_review')return unsupported(commandId,'evidence_incomplete');
 if(caseFile.evidenceTrust!=='authorized_current_record')return unsupported(commandId,'evidence_not_server_confirmed');
 const base={proposalId:'proposal_'+caseFile.caseId.slice(6,22)+'_'+commandId.replace(/[^a-z0-9]/gi,'_'),caseId:caseFile.caseId,commandId,status:'proposed_not_authorized',
  requiresApproval:true,externalEffects:false,approvalPath:'existing_typed_command_registry',receiptRef:null,executed:false,executionAuthority:false};
 if(caseFile.detectorId===DETECTORS.invoiceDueDate){
  if(caseFile.evidence?.dueState!=='past_due')return unsupported(commandId,'invoice_not_yet_due');
  if(strictFinancialDate(due)===null)return unsupported(commandId,'follow_up_due_date_required');
  const invoice=caseFile.subjectRefs.find(r=>r.type==='invoices');
  return freeze({...base,params:{ref:{store:'invoices',id:invoice.id},due},sourceRevision:invoice.revision});
 }
 if(caseFile.detectorId===DETECTORS.quoteFollowUp){
  if(caseFile.evidence?.followUpDue!==true)return unsupported(commandId,'follow_up_not_due');
  if(strictFinancialDate(due)===null)return unsupported(commandId,'follow_up_due_date_required');
  const quote=caseFile.subjectRefs.find(r=>r.type==='quotes');
  // Internal task only: customer messaging is never proposed, whatever the contact restriction says.
  return freeze({...base,params:{ref:{store:'quotes',id:quote.id},due},sourceRevision:quote.revision,customerContact:'not_proposed'});
 }
 if(caseFile.detectorId===DETECTORS.fieldBlocker){
  if(caseFile.evidence?.acknowledgment!=='none_recorded')return unsupported(commandId,'blocker_already_acknowledged');
  const job=caseFile.subjectRefs.find(r=>r.type==='jobs');
  return freeze({...base,params:{kind:'task',ref:{store:'jobs',id:job.id},title:'Review reported field blocker on job '+job.id},sourceRevision:job.revision,
   requiresApproval:true,approvalPath:'existing_draft_review_on_save',crewReassignment:'not_proposed',supplierOrder:'not_proposed'});
 }
 return unsupported(commandId,'unknown_detector');
}

/* -------------------------------------------- governed learning candidates */
export async function recordRecommendationFeedback({caseFile,feedback,scope,note='',now=new Date().toISOString()}={}){
 if(!validCase(caseFile))throw Error('Valid proactive case required');
 if(!FEEDBACK.has(feedback))throw Error('Feedback must be accepted, corrected or rejected');
 if(!scope||scope.businessId!==caseFile.tenantId)throw Error('Feedback scope does not match the case tenant');
 const actor=scope.mode==='local'?{subject:scope.actor,role:'owner'}:scope.mode==='cloud'&&scope.identity?.subject?{subject:scope.identity.subject,role:scope.role}:null;
 if(!actor||!['owner','admin'].includes(actor.role))throw Error('Only an owner or admin may record recommendation feedback');
 if(typeof note!=='string'||note.length>500)throw Error('Feedback note must be text of at most 500 characters');
 const at=time('now',now);
 const sourceRevisions=caseFile.subjectRefs.map(r=>refKey(r)+'@'+(r.revision===null?'local':r.revision)).sort();
 const lessonId='lesson_'+await shortHash(canonical({tenantId:caseFile.tenantId,caseId:caseFile.caseId,feedback,actor:actor.subject,at}));
 return freeze({kind:LEARNING_KIND,version:1,tenantId:caseFile.tenantId,lessonId,
  hypothesis:`Owner feedback "${feedback}" on ${caseFile.detectorId} for ${subjectOf(caseFile)}; future evaluations of the same subject should surface this feedback as context, not as a changed rule.`,
  supportingCaseIds:[caseFile.caseId],verifiedReceiptIds:[],sourceRevisions,feedback,
  note:{text:note,trust:'user_supplied_untrusted'},
  measurement:{metric:'recommendation_feedback',baseline:null,after:null,sampleCount:1,limitations:['Single feedback event; no measured business outcome.','No receipts verified.']},
  scope:'tenant_only',status:'candidate',policyEffect:'none',authorityChange:false,
  provenance:{actorSubject:actor.subject,actorRole:actor.role,detectorId:caseFile.detectorId,caseDedupeKey:caseFile.dedupeKey,recordedAt:new Date(at).toISOString()},
  expiresAt:new Date(at+LEARNING_TTL_MS).toISOString(),executionAuthority:false});
}
export function applyLearningHints({cases=[],candidates=[],now=new Date().toISOString()}={}){
 const at=time('now',now);
 const usable=candidates.filter(l=>l?.kind===LEARNING_KIND&&l.executionAuthority===false&&l.scope==='tenant_only'&&['candidate','approved'].includes(l.status)&&Date.parse(l.expiresAt)>at&&l.policyEffect==='none');
 return cases.map(c=>{
  if(!validCase(c))throw Error('Invalid proactive case');
  const hints=usable.filter(l=>l.tenantId===c.tenantId&&l.provenance?.detectorId===c.detectorId).map(l=>{
   const sameSubject=l.provenance.caseDedupeKey.split('|').slice(0,3).join('|')===c.dedupeKey.split('|').slice(0,3).join('|');
   return {lessonId:l.lessonId,feedback:l.feedback,appliesTo:sameSubject?'same_subject':'same_detector',status:l.status};
  }).sort((a,b)=>a.lessonId.localeCompare(b.lessonId));
  if(!hints.length)return c;
  const reasons=[...c.priorityReasons,...hints.filter(h=>h.appliesTo==='same_subject').map(h=>'owner_feedback_on_same_subject:'+h.feedback)];
  // Hints annotate; severity, conclusion, status, proposals and authority are untouched.
  return freeze({...c,learningHints:hints,priorityReasons:[...new Set(reasons)]});
 });
}
