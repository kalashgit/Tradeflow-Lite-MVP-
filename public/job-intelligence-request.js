// Deterministic local owner intent routing. Never authorizes a write or determines invoice eligibility.
export function resolveJobReviewIntent(text,jobs){
 if(typeof text!=='string'||text.length>1200)return {status:'not_job_review'};
 const lower=text.toLowerCase();
 if(!/\b(job|jobs|project|projects|invoice|invoicing|bill|billing|cost|costs|overrun|labor|labour)\b/.test(lower)||!/\b(review|check|investigat|identify|find|ready|prepare|which|show|explain|overrun)/.test(lower))return {status:'not_job_review'};
 const eligible=(Array.isArray(jobs)?jobs:[]).filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&x.title.trim()&&['Completed','Cancelled'].includes(x.status)!==true);
 const completed=(Array.isArray(jobs)?jobs:[]).filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&x.title.trim()&&x.status==='Completed');
 const all=[...eligible,...completed];
 const matches=all.filter(x=>lower.includes(x.title.trim().toLowerCase()));
 if(matches.length===1)return {status:'selected',jobs:matches};
 if(matches.length>1)return {status:'ambiguous',jobs:matches.map(x=>({id:x.id,title:x.title}))};
 const requestedAll=/\b(all|my|active|completed|which)\b/.test(lower)||/\bjobs\b/.test(lower);
 if(!requestedAll)return {status:'ambiguous',jobs:all.slice(0,12).map(x=>({id:x.id,title:x.title}))};
 if(!all.length)return {status:'empty',jobs:[]};
 if(all.length>20)return {status:'too_many',count:all.length};
 return {status:'selected',jobs:requestedAll?all:[all[0]]};
}
export function explainJobDecision(job,decision){
 if(!job||!decision||!Array.isArray(decision.observations))throw Error('Verified job review required');
 const refs=[...new Set(decision.observations.flatMap(o=>o.refs||[]).filter(r=>r&&r.type&&r.id).map(r=>r.type+':'+r.id+'@'+(r.revision||0)))].slice(0,8);
 const findings=decision.observations.slice(0,4).map(o=>o.text);
 const unknowns=[...new Set((decision.unknowns||[]).map(x=>x.code))];
 const invoice=job.status==='Completed'?'Completed status is recorded, but invoice readiness requires independently reviewed completion/signoff, scope, billing terms, change-order approval and existing invoice state. No invoice has been prepared.':'Job is not recorded Completed; invoice readiness is not established.';
 const lines=['Job: '+job.title+' ('+job.status+').',...findings.map(x=>'Finding: '+x),findings.length?'':'No eligible exception was found in the available evidence; this is not a complete audit.',invoice,unknowns.length?'Unverified evidence: '+unknowns.join(', ')+'.':'',decision.proposals.length?'Available after explicit approval: '+decision.proposals.map(p=>p.label).join('; ')+'.':'No action is authorized from this review.', 'No record was changed. Open the saved job review to inspect sources and approval controls.'].filter(Boolean);
 return {content:lines.join('\n'),refs};
}
