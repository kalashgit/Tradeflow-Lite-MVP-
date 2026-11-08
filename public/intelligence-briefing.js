/* Master Intelligence operational briefing: read-only view over existing detectors. */
import {assessInvoiceReadiness} from './job-intelligence-request.js';
const text=x=>typeof x==='string'?x.trim():'';
const scoped=(rows,id)=>Array.isArray(rows)?rows.filter(x=>x&&(!x.businessId||x.businessId===id)):[];
const ref=x=>x&&text(x.store)&&text(x.id)?x.store+':'+x.id:null;
export function isBusinessBriefingRequest(s){
 return typeof s==='string'&&s.trim().length<=160&&(/^(?:give|show|send) me (?:an? )?(?:update|briefing|overview|status) (?:on|of) my business[.!?]?$/i.test(s.trim())||/^(?:(?:please\s+)?(?:give|show|prepare|create|generate|run|pull|fetch|get)\s+(?:me\s+)?(?:a|an|my|the|our)?\s*)?(?:(?:local|saved|recorded|device-local)\s+)?(?:business|company|operations|operational)\s+(?:briefing|overview|status|update|snapshot|summary)(?:\s+(?:from|using|of|on)\s+(?:my|our|the)?\s*(?:local|saved|recorded|device-local)?\s*(?:records|data))?[.!?]?$/i.test(s.trim()));
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
 const v=s.trim().toLowerCase();
 if(/^why (?:is|was) (?:that|this|the) job blocked\??$/.test(v))return 'why_blocked';
 if(/^who (?:needs to|has to|must|should) approv(?:e|e) (?:it|that|this)\??$/.test(v))return 'who_approves';
 if(/^(?:show me|show|inspect) (?:the|that|its) evidence\??$/.test(v))return 'show_evidence';
 if(/^(?:prepare|open) (?:the|that|its) review\??$/.test(v))return 'open_review';
 if(/^(?:go to|open) (?:that|this|the) job\??$/.test(v))return 'open_job';
 return null;
}
