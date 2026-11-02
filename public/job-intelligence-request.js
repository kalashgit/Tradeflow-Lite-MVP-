import {evaluateInvoiceCandidate} from './invoice-readiness.js';
// Deterministic local owner intent routing. Never authorizes a write or determines invoice eligibility.
export function resolveJobReviewIntent(text,jobs){
 if(typeof text!=='string'||text.length>1200)return {status:'not_job_review'};
 const lower=text.toLowerCase();
 if(!/\b(job|jobs|project|projects|invoice|invoicing|bill|billing|cost|costs|overrun|labor|labour)\b/.test(lower)||!/\b(review|check|investigat|identify|find|ready|prepare|which|show|explain|overrun)/.test(lower))return {status:'not_job_review'};
 const eligible=(Array.isArray(jobs)?jobs:[]).filter(x=>x&&(!x.businessId||x.businessId==='local-business')&&typeof x.id==='string'&&typeof x.title==='string'&&x.title.trim()&&['Completed','Cancelled'].includes(x.status)!==true);
 const completed=(Array.isArray(jobs)?jobs:[]).filter(x=>x&&(!x.businessId||x.businessId==='local-business')&&typeof x.id==='string'&&typeof x.title==='string'&&x.title.trim()&&x.status==='Completed');
 const all=[...eligible,...completed];
 const matches=all.filter(x=>lower.includes(x.title.trim().toLowerCase()));
 if(matches.length===1)return {status:'selected',jobs:matches};
 if(matches.length>1)return {status:'ambiguous',jobs:matches.map(x=>({id:x.id,title:x.title}))};
 // "Last job" is not a request for the whole portfolio. Prefer a uniquely
 // identifiable completed job; never guess from IndexedDB row order.
 if(/\b(last|latest|most recent)\b/.test(lower)){
  if(!all.length)return {status:'empty',jobs:[]};
  const candidates=completed.length?completed:all;
  if(candidates.length===1)return {status:'selected',jobs:[candidates[0]],resolution:completed.length?'only_completed_job':'only_saved_job'};
  const dated=candidates.map(job=>{
   const raw=job.completedAt||job.completionDate||job.dateCompleted;
   const stamp=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(raw)?Date.parse(raw):NaN;
   return {job,stamp};
  });
  if(dated.every(x=>Number.isFinite(x.stamp))){
   dated.sort((x,y)=>y.stamp-x.stamp);
   if(dated[0].stamp>dated[1].stamp)return {status:'selected',jobs:[dated[0].job],resolution:'unique_recorded_completion_time'};
  }
  return {status:'ambiguous',jobs:candidates.slice(0,12).map(x=>({id:x.id,title:x.title}))};
 }
 const requestedAll=/\b(all|my|active|completed|which)\b/.test(lower)||/\bjobs\b/.test(lower);
 if(!requestedAll)return {status:'ambiguous',jobs:all.slice(0,12).map(x=>({id:x.id,title:x.title}))};
 if(!all.length)return {status:'empty',jobs:[]};
 if(all.length>20)return {status:'too_many',count:all.length};
 return {status:'selected',jobs:requestedAll?all:[all[0]]};
}
// Conservative local readiness contract: no customer-specific signoff/terms are inferred.
export function assessInvoiceReadiness({job,invoices=[],quotes=[],customer=null,quote=null,evidence=undefined,businessId='local-business'}){
 if(evidence!==undefined)return evaluateInvoiceCandidate({job,invoices,customer,quote,evidence,businessId});
 if(!job||typeof job.id!=='string')throw Error('Saved job identity required');
 const local=rows=>Array.isArray(rows)?rows.filter(r=>r&&(!r.businessId||r.businessId==='local-business')):[];
 const linkedInvoices=local(invoices).filter(x=>x.jobId===job.id&&x.status!=='Void');
 const linkedQuotes=local(quotes).filter(x=>x.id===job.quoteId||x.jobId===job.id);
 const blockers=[];
 if(job.status!=='Completed')blockers.push('job_not_recorded_completed');
 if(!job.customerId)blockers.push('customer_not_linked');
 if(linkedInvoices.length)blockers.push('existing_invoice_requires_review');
 if(!linkedQuotes.some(x=>x.status==='Accepted'))blockers.push('accepted_scope_not_verified');
 // The current record schema provides no independently verified completion signoff,
 // billing terms, or confirmed change-order approval contract.
 blockers.push('completion_signoff_unverified','billing_terms_unverified','change_order_approval_unverified');
 return Object.freeze({status:'blocked',jobId:job.id,blockers:Object.freeze(blockers),invoiceCount:linkedInvoices.length,acceptedQuoteRecorded:linkedQuotes.some(x=>x.status==='Accepted'),mayPrepareInvoice:false,maySendInvoice:false});
}
export function explainJobDecision(job,decision,readiness){
 if(!job||!decision||!Array.isArray(decision.observations))throw Error('Verified job review required');
 const refs=[...new Set(decision.observations.flatMap(o=>o.refs||[]).filter(r=>r&&r.type&&r.id).map(r=>r.type+':'+r.id+'@'+(r.revision||0)))].slice(0,8);
 const findings=decision.observations.slice(0,4).map(o=>o.text);
 const unknowns=[...new Set((decision.unknowns||[]).map(x=>x.code))];
 const invoice=job.status==='Completed'?'Completed status is recorded, but invoice readiness requires independently reviewed completion/signoff, scope, billing terms, change-order approval and existing invoice state. No invoice has been prepared.':'Job is not recorded Completed; invoice readiness is not established.';
 const readinessText=readiness?'Invoice readiness: '+readiness.status+' ('+readiness.blockers.join(', ')+'). No billing action is authorized.':'';
 const caseFile=decision.case?.kind==='tradeflow.intelligence.case.v1'?decision.case:null;
 const caseText=caseFile?'Intelligence case: '+caseFile.status+'; '+caseFile.sources.length+' referenced record(s), '+caseFile.proposals.length+' owner-review option(s). Snapshot only; no delegated action.':'';
 const lines=['Job: '+job.title+' ('+job.status+').',...findings.map(x=>'Finding: '+x),findings.length?'':'No eligible exception was found in the available evidence; this is not a complete audit.',invoice,readinessText,caseText,unknowns.length?'Unverified evidence: '+unknowns.join(', ')+'.':'',decision.proposals.length?'Available after explicit approval: '+decision.proposals.map(p=>p.label).join('; ')+'.':'No action is authorized from this review.', 'No record was changed. Open the saved job review to inspect sources and approval controls.'].filter(Boolean);
 return {content:lines.join('\n'),refs};
}
