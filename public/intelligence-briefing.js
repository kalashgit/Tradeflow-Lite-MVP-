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
