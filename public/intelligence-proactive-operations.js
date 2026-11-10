/* TF-MI-LEARN-01 Phase B — O3 crew/material readiness and O4 quotation follow-up detectors.
 *
 * Pure and read-only, like Phase A. Inputs are the already-authorized intelligence context
 * (validated by the existing validateEvidence path). Nothing here infers stock, supplier ETA,
 * worker availability or acknowledgment from unrelated metadata: every absent fact becomes an
 * explicit unknown or a missing_data case, never a confident claim. No vendor order, crew
 * reassignment or customer message is ever proposed by this module.
 */
import {validateEvidence} from './intelligence-evidence.js';
import {strictFinancialDate} from './intelligence-financial-evidence.js';
import {DETECTORS,createProactiveCase,deny,actorOf,trustOf,checkTrigger,validId as id,refKey} from './intelligence-proactive-cases.js';

const DAY=86400000;
const state=x=>String(x??'').trim().toLowerCase();
const INACTIVE_JOB=new Set(['completed','done','cancelled','canceled','void']);
const OPEN_ORDER=new Set(['planned','ordered','in transit','in_transit']);
const CLOSED_ORDER=new Set(['delivered','cancelled','canceled']);
const RESTRICTED=new Set(['do_not_contact','opted_out','no_contact']);
const time=x=>{const t=Date.parse(x);if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(x)||!Number.isFinite(t))throw Error('ISO timestamp required');return t};
const minutes=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x)?Number(x.slice(0,2))*60+Number(x.slice(3)):null;
const dateOf=job=>{const d=job.date||job.scheduledDate;return strictFinancialDate(d)===null?null:d};
const subject=(...parts)=>parts.join('|');
const ref=r=>({type:r.type,id:r.id,revision:r.revision,updatedAt:r.updatedAt??null});

async function prepare({context,scope,asOfDate,now,trigger,horizonDays,roles}){
 if(!scope||!id(scope.businessId))return {error:deny('invalid','scope_required')};
 if(!Number.isSafeInteger(horizonDays)||horizonDays<0||horizonDays>60)return {error:deny('invalid','invalid_horizon')};
 const asOf=strictFinancialDate(asOfDate);if(asOf===null)return {error:deny('invalid','invalid_or_ambiguous_date')};
 let observedAt;try{observedAt=time(now)}catch{return {error:deny('invalid','invalid_observation_time')}}
 if(Array.isArray(context?.records)&&context.records.length>200)return {error:deny('denied','bounded_snapshot_exceeded')};
 let validated;try{validated=await validateEvidence(context,scope)}catch(error){return {error:deny('denied','evidence_rejected',{detail:String(error.message).slice(0,120)})}}
 let trig;try{trig=checkTrigger(trigger,scope.businessId)}catch(error){return {error:deny('invalid','trigger_rejected',{detail:error.message})}}
 const actor=actorOf(scope);
 if(!roles.includes(actor.role))return {error:deny('denied','role_not_permitted_for_detector')};
 let evidenceTrust;try{evidenceTrust=trustOf(scope,validated.local,trig)}catch(error){return {error:deny('invalid','synthetic_scope_rejected',{detail:error.message})}}
 const byKey=new Map(context.records.map(r=>[refKey(r),r]));
 const horizonEnd=asOf+horizonDays*DAY;
 return {asOf,observedAt,trig,actor,evidenceTrust,byKey,records:context.records,horizonEnd,local:validated.local};
}
const trustGaps=trust=>trust==='authorized_current_record'?[]:[trust==='synthetic'?'synthetic_evidence_only':'server_confirmation_pending'];
const revisionTag=r=>r.revision===null?'hash:'+r.contentHash:'rev:'+r.revision;

/* ------------------------------------------------ O3: crew and material readiness */
export async function detectCrewMaterialReadiness({context,scope,asOfDate,now=new Date().toISOString(),trigger=null,horizonDays=7}={}){
 const p=await prepare({context,scope,asOfDate,now,trigger,horizonDays,roles:['owner','admin','member']});
 if(p.error)return p.error;
 const {asOf,observedAt,trig,actor,evidenceTrust,byKey,records,horizonEnd}=p;
 const tenantId=scope.businessId,unknowns=[],cases=[],resolvedSubjects=[];
 const jobs=records.filter(r=>r.type==='jobs'&&!INACTIVE_JOB.has(state(r.record.status)));
 const crewVisible=records.some(r=>r.type==='crew');
 const ordersVisible=records.some(r=>r.type==='supplyOrders');
 if(!ordersVisible)unknowns.push(actor.role==='member'?'material_orders_not_visible_to_role':'material_orders_absent_from_snapshot');
 const inHorizon=job=>{const d=dateOf(job.record);if(d===null)return null;const t=strictFinancialDate(d);return t<=horizonEnd};
 const common={tenantId,evidenceTrust,observedAt,actor,trigger:trig};
 const linkage=(job,subjectRefs,missingData)=>{
  if(id(job.record.crewId)){const crew=byKey.get('crew:'+job.record.crewId);if(crew)subjectRefs.push(ref(crew));else missingData.push('assigned_crew_withheld_or_unavailable')}
  else missingData.push('crew_assignment_missing');
  if(!id(job.record.customerId))missingData.push('customer_linkage');
  if(dateOf(job.record)===null)missingData.push('scheduled_date_missing_or_invalid');
 };
 // 1) Confirmed field blockers (TF-RM-03 readback) without a recorded acknowledgment — P14 / P21.
 for(const job of jobs){
  const updates=Array.isArray(job.record.fieldUpdates)?job.record.fieldUpdates:[];
  const acks=new Set(updates.filter(u=>u.kind==='job_blocker_acknowledged'&&id(u.acknowledgesEventId)).map(u=>u.acknowledgesEventId));
  for(const u of updates){
   if(u.kind!=='job_blocker_reported')continue;
   if(!id(u.eventId)){unknowns.push('field_update_without_event_id:'+job.id);continue}
   const key=subject('jobs:'+job.id,'blocker:'+u.eventId);
   if(acks.has(u.eventId)){resolvedSubjects.push({subjectKey:key,reason:'acknowledged'});continue}
   const subjectRefs=[ref(job)],missingData=[...trustGaps(evidenceTrust)];
   linkage(job,subjectRefs,missingData);
   const scheduled=dateOf(job.record),due=scheduled!==null&&strictFinancialDate(scheduled)<=asOf;
   const conclusion=missingData.length?'missing_data':'needs_review';
   const severity=conclusion==='needs_review'&&due?'urgent':conclusion==='needs_review'?'attention':'informational';
   cases.push(await createProactiveCase({...common,detectorId:DETECTORS.fieldBlocker,subjectRefs,completeness:missingData.length?'partial':'complete',missingData,severity,
    priorityReasons:['field_blocker_unacknowledged','job_scheduled:'+(scheduled||'unknown'),'evidence_trust:'+evidenceTrust,...(due?['crew_waiting_possible_today']:[])],conclusion,
    explanation:`Job ${job.id} (revision ${job.revision??'local'}) carries a recorded field blocker report ${u.eventId}${u.actorId?' attributed to '+u.actorId:''} with no recorded office acknowledgment. The report text is withheld from Intelligence evidence; open the job to read it. Reporter attribution is recorded, not verified.`,
    recommendation:conclusion==='needs_review'?'Office review: acknowledge the blocker through the existing crew ⇄ office exchange and decide the internal response. No supplier order, delivery date or crew reassignment is proposed.':'Complete the job linkage or confirm the evidence source before acting; the blocker stays open until an acknowledgment is recorded.',
    unknowns:['blocker_cause_unverified','material_stock_unknown','acknowledgment_not_recorded'],dedupeKey:[tenantId,DETECTORS.fieldBlocker,'jobs:'+job.id,'blocker:'+u.eventId,revisionTag(job)].join('|'),subjectKey:key,jobId:job.id,
    evidence:{blockerEventId:u.eventId,reportedAt:typeof u.at==='string'?u.at:null,reporterId:typeof u.actorId==='string'?u.actorId:null,reporterAttributionVerified:false,acknowledgment:'none_recorded',noteWithheld:true,scheduledDate:scheduled,crewId:id(job.record.crewId)?job.record.crewId:null},
    limitations:['A recorded report is not proof of the underlying shortage; the office must verify.','Resolution requires a recorded acknowledgment; no acknowledgment is inferred from job status changes.']}));
  }
 }
 // 2) Same-crew double booking — P13 / P26. Times are compared only when both jobs record start time and duration.
 const byCrewDay=new Map();
 for(const job of jobs){const d=dateOf(job.record);if(d===null||!id(job.record.crewId)||inHorizon(job)===false||strictFinancialDate(d)<asOf-DAY)continue;const k=job.record.crewId+'|'+d;(byCrewDay.get(k)||byCrewDay.set(k,[]).get(k)).push(job)}
 for(const [k,group]of byCrewDay){
  if(group.length<2)continue;
  const [crewId,date]=k.split('|');
  group.sort((a,b)=>a.id.localeCompare(b.id));
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
   const a=group[i],b=group[j];
   const windows=[a,b].map(x=>{const start=minutes(x.record.startTime),len=Number.isSafeInteger(x.record.durationMinutes)&&x.record.durationMinutes>0?x.record.durationMinutes:null;return start===null||len===null?null:{start,end:start+len}});
   const timed=windows.every(Boolean);
   const overlap=timed&&windows[0].start<windows[1].end&&windows[1].start<windows[0].end;
   if(timed&&!overlap)continue;
   const subjectRefs=[ref(a),ref(b)],missingData=[...trustGaps(evidenceTrust)];
   const crew=byKey.get('crew:'+crewId);if(crew)subjectRefs.push(ref(crew));else missingData.push('assigned_crew_withheld_or_unavailable');
   if(!timed)missingData.push('schedule_times_unrecorded');
   const conclusion=missingData.length?'missing_data':'needs_review';
   const key=subject('crew:'+crewId,'date:'+date,'jobs:'+a.id,'jobs:'+b.id);
   cases.push(await createProactiveCase({...common,detectorId:DETECTORS.crewConflict,subjectRefs,completeness:missingData.length?'partial':'complete',missingData,
    severity:conclusion==='needs_review'?(strictFinancialDate(date)<=asOf?'urgent':'attention'):'informational',
    priorityReasons:['same_crew_same_day','scheduled_date:'+date,timed?'recorded_times_overlap':'times_unrecorded','evidence_trust:'+evidenceTrust],conclusion,
    explanation:timed?`Jobs ${a.id} and ${b.id} are both assigned to crew ${crewId} on ${date} and their recorded start times and durations overlap.`:`Jobs ${a.id} and ${b.id} are both assigned to crew ${crewId} on ${date}; start times or durations are not recorded, so an actual time conflict cannot be determined.`,
    recommendation:timed?'Review the two assignments in Dispatch. No automatic reassignment is proposed.':'Record start times and durations for both jobs, or confirm the same-day assignment is intentional.',
    unknowns:['travel_time_unknown','crew_availability_unrecorded'],dedupeKey:[tenantId,DETECTORS.crewConflict,key,revisionTag(a),revisionTag(b)].join('|'),subjectKey:key,
    evidence:{crewId,date,jobs:[{id:a.id,startTime:a.record.startTime??null,durationMinutes:a.record.durationMinutes??null},{id:b.id,startTime:b.record.startTime??null,durationMinutes:b.record.durationMinutes??null}],timesRecorded:timed,overlapDetermined:timed?overlap:null},
    limitations:['Crew working days and days off are not part of the Intelligence projection; availability is not inferred.']}));
  }
 }
 if(jobs.some(j=>id(j.record.crewId))&&!crewVisible)unknowns.push('crew_records_absent_from_snapshot');
 if(jobs.some(j=>id(j.record.crewId)))unknowns.push('crew_availability_unrecorded');
 // 3) Material orders linked to jobs in the horizon — P41 / P42. Only recorded purchase orders are considered.
 if(ordersVisible){
  const orders=records.filter(r=>r.type==='supplyOrders'&&!CLOSED_ORDER.has(state(r.record.status)));
  const byJob=new Map();
  for(const o of orders){if(!id(o.record.jobId))continue;(byJob.get(o.record.jobId)||byJob.set(o.record.jobId,[]).get(o.record.jobId)).push(o)}
  for(const [jobId,list]of byJob){
   const job=byKey.get('jobs:'+jobId);
   if(!job||INACTIVE_JOB.has(state(job.record.status))||inHorizon(job)===false)continue;
   list.sort((a,b)=>a.id.localeCompare(b.id));
   const scheduled=dateOf(job.record);
   // 3a) Late or undated delivery per order.
   for(const o of list){
    const planned=strictFinancialDate(o.record.plannedDate);
    const late=planned!==null&&planned<asOf&&OPEN_ORDER.has(state(o.record.status));
    const undated=planned===null;
    if(!late&&!undated)continue;
    const subjectRefs=[ref(job),ref(o)],missingData=[...trustGaps(evidenceTrust)];
    if(undated)missingData.push('supplier_eta_unrecorded');
    if(!id(o.record.supplierId))missingData.push('supplier_linkage');
    const conclusion=missingData.length?'missing_data':'needs_review';
    const key=subject('jobs:'+jobId,'supplyOrders:'+o.id);
    cases.push(await createProactiveCase({...common,detectorId:DETECTORS.materialOrder,subjectRefs,completeness:missingData.length?'partial':'complete',missingData,
     severity:conclusion==='needs_review'&&scheduled!==null&&strictFinancialDate(scheduled)<=asOf?'urgent':conclusion==='needs_review'?'attention':'informational',
     priorityReasons:[late?'planned_delivery_date_passed':'supplier_eta_unrecorded','job_scheduled:'+(scheduled||'unknown'),'evidence_trust:'+evidenceTrust],conclusion,
     explanation:late?`Purchase order ${o.id} for job ${jobId} has recorded status "${state(o.record.status)}" and a planned delivery date of ${o.record.plannedDate} that has passed as of ${asOfDate}; no delivery is recorded.`:`Purchase order ${o.id} for job ${jobId} has no recorded planned delivery date, so material readiness for the job cannot be assessed.`,
     recommendation:late?'Confirm delivery status with the supplier record owner and update the purchase order. No new order or delivery date is proposed.':'Record the supplier’s committed delivery date on the purchase order; no date is assumed.',
     unknowns:['actual_delivery_unknown','supplier_confirmation_unknown'],dedupeKey:[tenantId,DETECTORS.materialOrder,key,revisionTag(o),revisionTag(job)].join('|'),subjectKey:key,jobId,
     evidence:{orderId:o.id,orderStatus:state(o.record.status)||null,documentStatus:typeof o.record.documentStatus==='string'?o.record.documentStatus:null,plannedDate:planned===null?null:o.record.plannedDate,scheduledDate:scheduled,deliveryVerified:false},
     limitations:['Purchase order dates are owner-entered; supplier systems are not consulted.']}));
   }
   // 3b) Possible duplicate purchase requests: same job and supplier, more than one open order. Never asserted as duplicate.
   const bySupplier=new Map();for(const o of list){if(!id(o.record.supplierId))continue;(bySupplier.get(o.record.supplierId)||bySupplier.set(o.record.supplierId,[]).get(o.record.supplierId)).push(o)}
   for(const [supplierId,group]of bySupplier){
    if(group.length<2)continue;
    const key=subject('jobs:'+jobId,'supplier:'+supplierId,'orders:'+group.map(o=>o.id).join(','));
    cases.push(await createProactiveCase({...common,detectorId:DETECTORS.materialOrder,subjectRefs:[ref(job),...group.map(ref)],completeness:'partial',missingData:['duplicate_not_confirmed',...trustGaps(evidenceTrust)],severity:'informational',
     priorityReasons:['multiple_open_orders_same_supplier_and_job','evidence_trust:'+evidenceTrust],conclusion:'missing_data',
     explanation:`Job ${jobId} has ${group.length} open purchase orders with supplier ${supplierId} (${group.map(o=>o.id).join(', ')}). They may be intentional split orders or a duplicate request; this cannot be determined from the records.`,
     recommendation:'Review the listed purchase orders before issuing or paying either. No order is cancelled or created.',
     unknowns:['order_intent_unknown'],dedupeKey:[tenantId,DETECTORS.materialOrder,key,...group.map(revisionTag)].join('|'),subjectKey:key,jobId,
     evidence:{supplierId,orderIds:group.map(o=>o.id),duplicateConfirmed:false},limitations:['Order line items are not part of the Intelligence projection.']}));
   }
  }
 }
 return Object.freeze({status:'evaluated',reason:null,detectorId:'job.readiness_group',detectorIds:[DETECTORS.fieldBlocker,DETECTORS.crewConflict,DETECTORS.materialOrder],tenantId,evidenceTrust,asOfDate,horizonDays,
  evaluatedJobs:jobs.length,cases:Object.freeze(cases),resolvedSubjects:Object.freeze(resolvedSubjects),unknowns:Object.freeze([...new Set(unknowns)]),complete:true,modelInvoked:false,executionAuthority:false});
}
// Split a grouped readiness evaluation into per-detector evaluations for reconcileCases.
export function splitEvaluation(evaluation){
 if(evaluation?.status!=='evaluated'||!Array.isArray(evaluation.detectorIds))return [evaluation];
 return evaluation.detectorIds.map(detectorId=>Object.freeze({...evaluation,detectorId,detectorIds:undefined,cases:evaluation.cases.filter(c=>c.detectorId===detectorId),
  resolvedSubjects:(evaluation.resolvedSubjects||[]).filter(r=>detectorId===DETECTORS.fieldBlocker)}));
}

/* ------------------------------------------------------- O4: quotation follow-up */
export async function detectQuoteFollowUp({context,scope,asOfDate,now=new Date().toISOString(),trigger=null,followUpDays=14}={}){
 if(!Number.isSafeInteger(followUpDays)||followUpDays<1||followUpDays>90)return deny('invalid','invalid_follow_up_window');
 const p=await prepare({context,scope,asOfDate,now,trigger,horizonDays:0,roles:['owner','admin']});
 if(p.error)return p.error;
 const {asOf,observedAt,trig,actor,evidenceTrust,byKey,records}=p;
 const tenantId=scope.businessId,unknowns=[],cases=[],resolvedSubjects=[];
 const common={tenantId,evidenceTrust,observedAt,actor,trigger:trig};
 const quotes=records.filter(r=>r.type==='quotes');
 for(const q of quotes){
  const status=state(q.record.status);
  if(!status){unknowns.push('quote_status_unrecorded:'+q.id);continue}
  if(status!=='sent'){if(['accepted','declined','draft','expired','void'].includes(status))continue;unknowns.push('quote_status_unrecognized:'+q.id);continue}
  const subjectRefs=[ref(q)],missingData=[...trustGaps(evidenceTrust)];
  const customer=id(q.record.customerId)?byKey.get('customers:'+q.record.customerId):null;
  if(!id(q.record.customerId))missingData.push('customer_linkage');else if(!customer)missingData.push('customer_withheld_or_unavailable');else subjectRefs.push(ref(customer));
  if(id(q.record.opportunityId)){const opp=byKey.get('opportunities:'+q.record.opportunityId);if(opp)subjectRefs.push(ref(opp))}
  const restriction=customer?state(customer.record.contactRestriction):'';
  const contactRestriction=!customer?'unknown':restriction===''?'unrecorded':RESTRICTED.has(restriction)?'restricted':restriction==='none'||restriction==='allowed'?'none':'unrecognized';
  const sent=strictFinancialDate(q.record.sentDate);
  const stamps=[['lastFollowUpAt',q.record.lastFollowUpAt],['lastContactAt',q.record.lastContactAt]].filter(([,v])=>v!==undefined&&v!==null);
  const invalidStamp=stamps.find(([,v])=>typeof v!=='string'||strictFinancialDate(v.slice(0,10))===null||v.length>10&&!/^\d{4}-\d{2}-\d{2}T/.test(v));
  const ownerFollowUp=q.record.followup_date===undefined||q.record.followup_date===null?null:strictFinancialDate(q.record.followup_date);
  const key='quotes:'+q.id;
  const base={...common,detectorId:DETECTORS.quoteFollowUp,jobId:id(q.record.jobId)?q.record.jobId:null,subjectKey:key,dedupeKey:[tenantId,DETECTORS.quoteFollowUp,key,revisionTag(q)].join('|')};
  const communication={drafted:false,approved:false,sent:false,acknowledged:false};
  if(sent===null){
   missingData.push('sent_timestamp');
   cases.push(await createProactiveCase({...base,subjectRefs,completeness:'partial',missingData,severity:'informational',priorityReasons:['quote_sent_without_timestamp','data_quality'],conclusion:'missing_data',
    explanation:`Quotation ${q.id} (revision ${q.revision??'local'}) is recorded as sent but has no valid sent date, so no follow-up deadline can be established.`,
    recommendation:'Record the actual sent date on the quotation. No follow-up is marked overdue and no customer contact is proposed.',
    unknowns:['sent_date_unknown','customer_response_unknown'],evidence:{sentDate:null,followUpDue:null,daysSinceLastTouch:null,contactRestriction,communication},
    limitations:['A sent status without a timestamp does not prove when, or whether, the customer received the quotation.']}));
   continue;
  }
  if(invalidStamp){
   missingData.push('follow_up_timestamp_invalid');
   cases.push(await createProactiveCase({...base,subjectRefs,completeness:'partial',missingData,severity:'informational',priorityReasons:['follow_up_timestamp_invalid','data_quality'],conclusion:'missing_data',
    explanation:`Quotation ${q.id} records an unreadable ${invalidStamp[0]} value, so the last contact cannot be dated.`,
    recommendation:'Correct the recorded contact timestamp. No deadline is assumed.',unknowns:['last_contact_unknown'],evidence:{sentDate:q.record.sentDate,followUpDue:null,daysSinceLastTouch:null,contactRestriction,communication},limitations:[]}));
   continue;
  }
  const touches=[sent,...stamps.map(([,v])=>strictFinancialDate(v.slice(0,10)))];
  const latest=Math.max(...touches);
  if(latest>asOf){unknowns.push('quote_touch_in_future:'+q.id);continue}
  const daysSince=Math.round((asOf-latest)/DAY);
  const ownerDue=ownerFollowUp!==null&&ownerFollowUp<=asOf;
  const followUpDue=daysSince>=followUpDays||ownerDue;
  if(!followUpDue){resolvedSubjects.push({subjectKey:key,reason:'follow_up_not_yet_due'});continue}
  const conclusion=missingData.length?'missing_data':'needs_review';
  const reasons=[ownerDue?'owner_follow_up_date_reached':'days_since_last_touch:'+daysSince,'evidence_trust:'+evidenceTrust,'contact_restriction:'+contactRestriction];
  cases.push(await createProactiveCase({...base,subjectRefs,completeness:missingData.length?'partial':'complete',missingData,severity:conclusion==='needs_review'?'attention':'informational',priorityReasons:reasons,conclusion,
   explanation:`Quotation ${q.id} (revision ${q.revision??'local'}) was sent on ${q.record.sentDate}; the latest recorded touch is ${daysSince} day${daysSince===1?'':'s'} old${ownerDue?' and the owner-set follow-up date '+q.record.followup_date+' has been reached':''}. ${contactRestriction==='restricted'?'The customer record carries a contact restriction.':contactRestriction==='none'?'No contact restriction is recorded.':'Contact permission is not recorded.'} Unrecorded calls or emails are unknown.`,
   recommendation:(conclusion!=='needs_review'?'Complete the customer linkage or confirm the evidence source before scheduling a follow-up.':contactRestriction==='restricted'?'Internal review only: the customer has a recorded contact restriction.':'Review the quotation and, after explicit approval, schedule an internal follow-up task. No customer message is drafted or sent by TradeFlow.')+(contactRestriction==='restricted'?' No outreach of any kind is proposed.':''),
   unknowns:['customer_decision_unknown','unrecorded_contacts_unknown','estimating_hit_rate_unmeasured'],
   evidence:{sentDate:q.record.sentDate,lastFollowUpAt:q.record.lastFollowUpAt??null,lastContactAt:q.record.lastContactAt??null,ownerFollowUpDate:ownerFollowUp===null?null:q.record.followup_date,daysSinceLastTouch:daysSince,followUpDays,followUpDue:true,contactRestriction,contactRestricted:contactRestriction==='restricted',communication},
   limitations:['Recorded timestamps are operator-entered or owner-attested, not provider-confirmed delivery.','Bid outcome and estimating hit rate are not measured by this detector.']}));
 }
 return Object.freeze({status:'evaluated',reason:null,detectorId:DETECTORS.quoteFollowUp,tenantId,evidenceTrust,asOfDate,followUpDays,evaluatedRecords:quotes.length,cases:Object.freeze(cases),resolvedSubjects:Object.freeze(resolvedSubjects),unknowns:Object.freeze([...new Set(unknowns)]),complete:true,modelInvoked:false,executionAuthority:false});
}
