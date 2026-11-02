/* Master Intelligence operational briefing: read-only view over existing detectors. */
import {assessInvoiceReadiness} from './job-intelligence-request.js';
const text=x=>typeof x==='string'?x.trim():'';
const scoped=(rows,id)=>Array.isArray(rows)?rows.filter(x=>x&&(!x.businessId||x.businessId===id)):[];
const ref=x=>x&&text(x.store)&&text(x.id)?x.store+':'+x.id:null;
export function isBusinessBriefingRequest(s){
 return typeof s==='string'&&s.length<=1200&&( /\b(?:business|operations|company)\b/i.test(s)&&/\b(?:update|briefing|overview|status|happening|attention|priorit(?:y|ies)|review)\b/i.test(s) );
}
export function createOperationalBriefing({data,evaluation,businessId='local-business'}={}){
 if(!text(businessId)||!data||!evaluation||!Array.isArray(evaluation.findings))throw Error('Authorized snapshot and existing detector evaluation required');
 const stores={};for(const k of ['jobs','quotes','invoices','tasks','commandLog','customers','jobCosts','payments'])stores[k]=scoped(data[k],businessId);
 const own=new Set(Object.entries(stores).flatMap(([k,rows])=>rows.filter(x=>text(x.id)).map(x=>k+':'+x.id)));
 const jobs=stores.jobs,active=jobs.filter(x=>!['Completed','Cancelled','Canceled'].includes(x.status)),completed=jobs.filter(x=>x.status==='Completed');
 const blocked=completed.slice(0,30).map(job=>({job,check:assessInvoiceReadiness({job,invoices:stores.invoices,quotes:stores.quotes})})).filter(x=>x.check.status==='blocked');
 const findings=evaluation.findings.filter(f=>f&&Array.isArray(f.recordRefs)&&f.recordRefs.length&&f.recordRefs.every(r=>own.has(ref(r)))&&text(f.explanation));
 const openTasks=stores.tasks.filter(t=>!['Done','Completed','Cancelled','Canceled'].includes(t.status));
 const pending=stores.commandLog.filter(c=>c.kind==='pilot.command'&&c.actor==='local-owner'&&['needs_review','approved','executing','indeterminate'].includes(c.status));
 const lines=[
  'DEVICE-LOCAL BUSINESS BRIEFING (owner-entered records; NOT authenticated cloud evidence)',
  'Recorded jobs: '+active.length+' active, '+completed.length+' completed. Open internal tasks: '+openTasks.length+'. Pending/uncertain local command records: '+pending.length+'.',
  'Attention from existing detectors:',
  ...findings.slice(0,7).map(f=>'- '+f.explanation+' ['+f.recordRefs.map(ref).join(', ')+']'+(f.status==='blocked'?' (record review required)':'')),
  ...blocked.slice(0,7).map(x=>'- Invoice blocked for '+(text(x.job.title)||x.job.id)+': '+x.check.blockers.join(', ')+'. [jobs:'+x.job.id+']'),
  !findings.length&&!blocked.length?'No verified exceptions were identified in the available local records. This is not a full audit.':'',
  completed.length>30?'Only the first 30 completed jobs were checked for invoice blockers; narrow the scope for a complete review.':'',
  'Next: Ask about a named job to inspect recorded evidence, or use its existing review controls for approval-gated internal tasks.',
  'No invoice draft, external message, payment, or task was created. Profit, payroll, bank settlement and customer signoff are not independently verified.'
 ].filter(Boolean);
 return Object.freeze({status:'device_local_review',content:lines.join('\n').slice(0,3500),activeCount:active.length,completedCount:completed.length,blockedInvoiceCount:blocked.length,openTaskCount:openTasks.length,pendingCommandCount:pending.length,refs:Object.freeze([...new Set([...findings.flatMap(f=>f.recordRefs.map(ref)),...blocked.map(x=>'jobs:'+x.job.id)])].slice(0,12)),blockedJobIds:Object.freeze(blocked.map(x=>x.job.id)),executionAuthority:false});
}

/* Follow-up classification does not authorize action; the host must bind a thread-scoped record. */
export function classifyBriefingFollowUp(s){
 if(typeof s!=='string'||s.length>240)return null;
 const v=s.trim().toLowerCase().replace(/[’]/g,"'");
 if(/^(?:what(?:'s| is) blocking (?:this|that|the) (?:job|project)(?:,? and what (?:should|can) we do)?|what (?:should|can) we do about (?:this|that|the) (?:job|project))\??$/.test(v))return 'job_blockers';
 if(/^why (?:are|were) (?:the |our )?labou?r (?:hours )?(?:over budget|over(?: the)? estimate)\??$/.test(v)||
    /^what(?:'s| is| was) (?:causing|caused) (?:the |this )?labou?r (?:hours )?(?:overrun|variance)\??$/.test(v))return 'labor_cause';
 if(/^why (?:is|was) (?:that|this|the) job blocked\??$/.test(v))return 'why_blocked';
 if(/^who (?:needs to|has to|must|should) approv(?:e|e) (?:it|that|this)\??$/.test(v))return 'who_approves';
 if(/^(?:show me|show|inspect) (?:the|that|its) evidence\??$/.test(v))return 'show_evidence';
 if(/^(?:prepare|open) (?:the|that|its) review\??$/.test(v))return 'open_review';
 if(/^(?:go to|open) (?:that|this|the) job\??$/.test(v))return 'open_job';
 return null;
}


/* A freshly reviewed case explains recorded evidence; it cannot diagnose or execute. */
export function explainLaborFollowUp(decision,job){
 const unavailable=message=>Object.freeze({status:'unavailable',content:message+' Open the saved job review to check evidence; no action was taken.',refs:[],executionAuthority:false});
 const c=decision?.case;
 if(!job?.id||decision?.kind!=='tradeflow.decision.v1'||decision.status!=='ready_for_review'||c?.kind!=='tradeflow.intelligence.case.v1'||
  c.sourceBinding!==decision.binding||c.jobId!==job.id||c.businessId!=='local-business'||c.sourceMode!=='device_local_unverified'||
  c.executionAuthority!==false||decision.evidenceMode!=='device_local_unverified_identity')
  return unavailable('The current job-scoped labor investigation is unavailable or incomplete.');
 const findings=(decision.observations||[]).filter(o=>o?.detectorId==='job.labor_hours_variance_review'&&
  o.refs?.some(r=>r.type==='jobs'&&r.id===job.id)&&c.findings?.some(f=>f.id===o.id&&f.detectorId===o.detectorId));
 if(findings.length!==1)return unavailable('No supported labor overrun was found for the selected job.');
 const o=findings[0],planned=o.evidence?.estimatedLaborHours,actual=o.evidence?.recordedLaborHours;
 if(!Number.isFinite(planned)||planned<=0||!Number.isFinite(actual)||actual<=planned)return unavailable('Recorded labor quantities are inconsistent or incomplete.');
 const sources=c.sources?.filter(r=>(r.type==='jobs'&&r.id===job.id)||r.type==='jobCosts')||[];
 if(!sources.some(r=>r.type==='jobs'&&r.id===job.id)||!sources.some(r=>r.type==='jobCosts'))return unavailable('The labor finding lacks its source records.');
 const delta=Math.round((actual-planned)*100)/100,percentage=Math.round((actual-planned)/planned*1000)/10;
 const alternatives=(decision.inferences||[]).find(x=>x.findingId===o.id)?.alternatives;
 const hypotheses=Array.isArray(alternatives)?alternatives.filter(v=>typeof v==='string'&&v.length<=200).slice(0,3):[];
 const canReview=(decision.proposals||[]).some(p=>p.commandId==='job.labor_review.schedule'&&p.params?.ref?.store==='jobs'&&p.params.ref.id===job.id&&p.requiresApproval===true);
 const content=[
 'Recorded labor for '+String(job.title||job.id).slice(0,110)+': planned '+planned+' hours; actual '+actual+' hours; '+delta+' hours above the estimate ('+percentage+'%).',
 'Cause not established. These are manually entered hours, not independently verified time clock or payroll evidence.',
 hypotheses.length?'Possibilities to investigate, not proven causes: '+hypotheses.join(' '):'The recorded evidence does not establish the cause.',
 canReview?'An internal labor review is available through existing explicit approval controls.':'No internal labor review can be prepared until missing evidence is checked.',
 'No business record was changed.'
 ].join('\n');
 return Object.freeze({status:'recorded_variance',content,refs:sources.slice(0,8).map(r=>r.type+':'+r.id+'@'+(r.revision||0)),executionAuthority:false});
}

/* This is a narrative over current verified local case references, not a
 * billing readiness approval or a new executable planner.
 */
export function explainJobBlockers(decision,job,readiness){
 const unavailable=m=>Object.freeze({status:'unavailable',content:m+' Check the saved job evidence. No action was taken.',refs:[],executionAuthority:false});
 const c=decision?.case;
 if(!job?.id||job.businessId&&job.businessId!=='local-business'||decision?.kind!=='tradeflow.decision.v1'||
  !['ready_for_review','evidence_needs_review'].includes(decision.status)||c?.kind!=='tradeflow.intelligence.case.v1'||
  c.jobId!==job.id||c.businessId!=='local-business'||c.sourceMode!=='device_local_unverified'||
  c.sourceBinding!==decision.binding||c.executionAuthority!==false||decision.evidenceMode!=='device_local_unverified_identity'||
  !c.sources?.some(s=>s.type==='jobs'&&s.id===job.id))return unavailable('The current source-linked job investigation is unavailable.');
 if(readiness?.jobId!==job.id||readiness.status!=='blocked'||readiness.mayPrepareInvoice!==false||
   readiness.maySendInvoice!==false||!Array.isArray(readiness.blockers)||readiness.blockers.length>20)
  return unavailable('Billing readiness evidence is incomplete or invalid.');
 const labels={
  job_not_recorded_completed:'Job completion is not recorded',
  customer_not_linked:'Customer linkage needs review',
  existing_invoice_requires_review:'Existing invoice must be checked',
  accepted_scope_not_verified:'Accepted scope is not verified',
  completion_signoff_unverified:'Completion signoff has not been independently verified',
  billing_terms_unverified:'Billing terms have not been independently verified',
  change_order_approval_unverified:'Change-order approval has not been independently verified'
 };
 if(readiness.blockers.some(code=>!Object.prototype.hasOwnProperty.call(labels,code)))
  return unavailable('Unrecognized billing blockers require source review.');
 const sourceKeys=new Set(c.sources.map(s=>s.type+':'+s.id));
 const findings=(decision.observations||[]).filter(o=>o&&typeof o.text==='string'&&Array.isArray(o.refs)&&
  o.refs.some(r=>r.type==='jobs'&&r.id===job.id)&&o.refs.every(r=>sourceKeys.has(r.type+':'+r.id))&&
  c.findings?.some(f=>f.id===o.id&&f.detectorId===o.detectorId));
 const reviews=(decision.proposals||[]).filter(p=>p?.requiresApproval===true&&p.externalEffects===false&&
  p.params?.ref?.store==='jobs'&&p.params.ref.id===job.id&&
  c.proposals?.some(x=>x.proposalId===p.id&&x.commandId===p.commandId&&x.status==='proposed_not_authorized'));
 const attention=decision.status==='evidence_needs_review'?
  'Linked evidence needs review before interpreting its recorded cost or labor values.':
  findings.length?'Recorded operational exceptions: '+findings.slice(0,3).map(o=>o.text.slice(0,220)).join(' '):
  'No eligible exception was detected in the available records; this is not a complete audit.';
 const textBody=[
  'DEVICE-LOCAL JOB REVIEW — '+String(job.title||job.id).slice(0,100)+'. Recorded job status: '+String(job.status||'unknown').slice(0,50)+'.',
  'Invoice preparation blocked: '+readiness.blockers.map(code=>labels[code]).join('; ')+'.',
  attention,
  'Next: inspect the recorded job, verify completion signoff, approved scope, billing terms and missing cost/labor entries with the responsible people.',
  decision.status==='ready_for_review'&&reviews.length?
   'Optional internal review, only after explicit approval in existing TradeFlow controls: '+reviews.slice(0,3).map(p=>String(p.label||p.commandId).slice(0,100)).join('; ')+'.':
   'No internal review action is currently eligible from this evidence.',
  'These records do not establish a root cause. No invoice was prepared or sent, no task was created, and no business record was changed.'
 ].join('\n');
 const refs=c.sources.filter(s=>s.type==='jobs'&&s.id===job.id||['jobCosts','quotes','invoices','customers','tasks'].includes(s.type))
  .slice(0,8).map(s=>s.type+':'+s.id+'@'+(s.revision||0));
 return Object.freeze({status:decision.status==='evidence_needs_review'?'evidence_needs_review':'blocked_for_billing',
  content:textBody.slice(0,2400),refs,proposalIds:reviews.slice(0,3).map(p=>p.id),executionAuthority:false});
}
