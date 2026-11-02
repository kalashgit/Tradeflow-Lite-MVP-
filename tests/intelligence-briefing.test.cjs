const test=require('node:test'),assert=require('node:assert/strict');const load=()=>import('../public/intelligence-briefing.js');
const sample=()=>({data:{jobs:[{id:'j1',title:'Shop fitout',status:'Completed',customerId:'c1',quoteId:'q1'},{id:'j2',status:'Active'},{id:'private',businessId:'other',status:'Completed'}],quotes:[{id:'q1',status:'Accepted'}],invoices:[],tasks:[{id:'t1',status:'Open'}],commandLog:[]},evaluation:{findings:[{recordRefs:[{store:'tasks',id:'t1'}],explanation:'Task overdue'},{recordRefs:[{store:'jobs',id:'private'}],explanation:'FOREIGN'}]}});
test('business briefing routes independently of job question',async()=>{const {isBusinessBriefingRequest:f}=await load();assert.equal(f('Give me an update on my business'),true);assert.equal(f('Review my job'),false)});
test('existing detector findings, blocked billing, tenant filtering and no execution',async()=>{const {createOperationalBriefing:f}=await load(),r=f(sample());assert.equal(r.activeCount,1);assert.equal(r.completedCount,1);assert.equal(r.blockedInvoiceCount,1);assert.match(r.content,/Task overdue/);assert.match(r.content,/Invoice blocked/);assert.doesNotMatch(r.content,/FOREIGN/);assert.equal(r.executionAuthority,false)});
test('missing engine fails closed',async()=>{const {createOperationalBriefing:f}=await load();assert.throws(()=>f({data:{}}),/detector evaluation/)});

test('followups are bounded and never interpreted as permission',async()=>{
 const {classifyBriefingFollowUp:f}=await load();
 assert.equal(f('Why is that job blocked?'),'why_blocked');
 assert.equal(f('Who needs to approve it?'),'who_approves');
 assert.equal(f('Prepare the review'),'open_review');
 assert.equal(f('Show me the evidence'),'show_evidence');
 assert.equal(f('Go to that job'),'open_job');
 assert.equal(f('Why are labor hours over budget?'),'labor_cause');
 assert.equal(f("What's causing the labor overrun?"),'labor_cause');
 assert.equal(f('What is blocking this job, and what should we do?'),'job_blockers');
 assert.equal(f("What's blocking that project?"),'job_blockers');
 assert.equal(f('What should we do about this job?'),'job_blockers');
 assert.equal(f('Send the invoice'),null);
});

test('labor explanation cites manual evidence without inventing cause or executing a task',async()=>{
 const {explainLaborFollowUp:f}=await load(),binding='a'.repeat(64),job={id:'j1',title:'Synthetic job'};
 const c={kind:'tradeflow.intelligence.case.v1',sourceBinding:binding,jobId:'j1',businessId:'local-business',
   sourceMode:'device_local_unverified',executionAuthority:false,
   sources:[{type:'jobs',id:'j1'},{type:'jobCosts',id:'actual'}],
   findings:[{id:'one',detectorId:'job.labor_hours_variance_review'}]};
 const obs={id:'one',detectorId:'job.labor_hours_variance_review',refs:[{type:'jobs',id:'j1'}],
   evidence:{estimatedLaborHours:8,recordedLaborHours:12}};
 const d={kind:'tradeflow.decision.v1',binding,status:'ready_for_review',
   evidenceMode:'device_local_unverified_identity',case:c,observations:[obs],
   inferences:[{findingId:'one',alternatives:['Scope may have changed.']}],
   proposals:[{commandId:'job.labor_review.schedule',requiresApproval:true,params:{ref:{store:'jobs',id:'j1'}}}]};
 const x=f(d,job);
 assert.equal(x.status,'recorded_variance');
 assert.match(x.content,/planned 8 hours; actual 12 hours; 4 hours above the estimate \(50%\)/);
 assert.match(x.content,/Cause not established/);assert.match(x.content,/Possibilities to investigate, not proven causes/);
 assert.match(x.content,/explicit approval controls/);assert.equal(x.executionAuthority,false);
 assert.deepEqual(x.refs,['jobs:j1@0','jobCosts:actual@0']);
 for(const bad of [{...d,status:'evidence_needs_review'},{...d,case:{...c,businessId:'foreign'}},
   {...d,case:{...c,jobId:'another'}},{...d,observations:[]},
   {...d,observations:[{...obs,evidence:{estimatedLaborHours:8,recordedLaborHours:NaN}}]}])
  assert.equal(f(bad,job).status,'unavailable');
});

test('owner blockers are current case scoped, conservative and never authorize billing',async()=>{
 const {explainJobBlockers}=await load();
 const binding='c'.repeat(64),job={id:'job_01',title:'Synthetic panel replacement',status:'Completed',businessId:'local-business'};
 const c={kind:'tradeflow.intelligence.case.v1',jobId:job.id,businessId:'local-business',sourceBinding:binding,
  sourceMode:'device_local_unverified',executionAuthority:false,sources:[{type:'jobs',id:job.id},{type:'jobCosts',id:'actual_labor'}],
  findings:[{id:'finding_01',detectorId:'job.labor_hours_variance_review'}],
  proposals:[{proposalId:'p1',commandId:'job.labor_review.schedule',status:'proposed_not_authorized'}]};
 const d={kind:'tradeflow.decision.v1',status:'ready_for_review',binding,evidenceMode:'device_local_unverified_identity',case:c,
  observations:[{id:'finding_01',detectorId:'job.labor_hours_variance_review',text:'Recorded hours exceeded the estimate.',refs:[{type:'jobs',id:job.id}]}],
  proposals:[{id:'p1',label:'Prepare internal labor review',requiresApproval:true,externalEffects:false,
   commandId:'job.labor_review.schedule',params:{ref:{store:'jobs',id:job.id}}}]};
 const readiness={jobId:job.id,status:'blocked',blockers:['completion_signoff_unverified','billing_terms_unverified'],
  mayPrepareInvoice:false,maySendInvoice:false};
 const result=explainJobBlockers(d,job,readiness);
 assert.equal(result.status,'blocked_for_billing');assert.match(result.content,/Invoice preparation blocked/);
 assert.match(result.content,/Completion signoff has not been independently verified/);
 assert.match(result.content,/only after explicit approval/);assert.match(result.content,/No invoice was prepared or sent/);
 assert.deepEqual(result.proposalIds,['p1']);assert.equal(result.executionAuthority,false);
 for(const bad of [
  {d:{...d,case:{...c,businessId:'foreign'}}},{job:{...job,businessId:'foreign'}},
  {readiness:{...readiness,mayPrepareInvoice:true}},{d:{...d,evidenceMode:'authenticated_cloud_read'}}
 ])assert.equal(explainJobBlockers(bad.d||d,bad.job||job,bad.readiness||readiness).status,'unavailable');
 const limited=explainJobBlockers({...d,status:'evidence_needs_review',proposals:[]},job,readiness);
 assert.equal(limited.status,'evidence_needs_review');
 assert.doesNotMatch(limited.content,/Prepare internal labor review/);
});
