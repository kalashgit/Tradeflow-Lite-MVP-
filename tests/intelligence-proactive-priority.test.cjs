'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../public/command-registry.js');
let pr,cases,ops;
before(async()=>{pr=await import('../public/intelligence-proactive-priority.js');cases=await import('../public/intelligence-proactive-cases.js');ops=await import('../public/intelligence-proactive-operations.js')});
const issuer='https://identity.example.test',business='business_001',NOW='2026-11-10T09:00:00.000Z',AS_OF='2026-11-10';
const identity={issuer,subject:'owner_001'};
const scope=(over={})=>({mode:'cloud',businessId:business,role:'owner',identity,...over});
const row=(type,id,revision,record)=>({type,id,revision,updatedAt:'2026-11-09T00:00:00Z',provenance:'tenant_record',contentTrust:'untrusted_record_content',record});
const records=()=>[
 row('invoices','inv_past',3,{status:'Issued',customerId:'c_1',jobId:'job_1',dueDate:'2026-10-20',currency:'USD'}),
 row('invoices','inv_soon',1,{status:'Issued',customerId:'c_1',jobId:'job_1',dueDate:'2026-11-14',currency:'USD'}),
 row('invoices','inv_nojob',1,{status:'Issued',customerId:'c_1',dueDate:'2026-10-01',currency:'USD'}),
 row('jobs','job_1',2,{title:'Fitout',status:'Scheduled',customerId:'c_1',crewId:'crew_1',date:'2026-11-10',fieldUpdates:[{eventId:'evt_1',kind:'job_blocker_reported',actorId:'crew_1u',at:null}]}),
 row('crew','crew_1',1,{name:'A',role:'Electrician',status:'Active'}),
 row('quotes','q_1',2,{title:'Panel',status:'Sent',customerId:'c_1',sentDate:'2026-10-01'}),
 row('customers','c_1',1,{name:'Private'})
];
const context=()=>({kind:'tradeflow.intelligence.context.v1',businessId:business,identity,scope:{company:true},permission:{role:'owner'},readOnly:true,executionAuthority:false,records:records()});
async function allCases(){
 const a=await cases.detectInvoiceDueDateReview({context:context(),scope:scope(),asOfDate:AS_OF,now:NOW});
 const b=await ops.detectCrewMaterialReadiness({context:context(),scope:scope(),asOfDate:AS_OF,now:NOW});
 const c=await ops.detectQuoteFollowUp({context:context(),scope:scope(),asOfDate:AS_OF,now:NOW});
 return [...a.cases,...b.cases,...c.cases];
}
test('deterministic ranking explains every score component, never invents exposure or confidence, and marks ties',async()=>{
 const all=await allCases();
 const p=pr.prioritizeCases({cases:all,now:NOW});
 assert.equal(p.kind,'tradeflow.intelligence.proactive.priority.v1');assert.equal(p.modelInvoked,false);
 const bySubject=Object.fromEntries(p.ranked.map(r=>[r.subjectKey,r]));
 assert.equal(p.ranked[0].subjectKey,'jobs:job_1|blocker:evt_1'); // urgent, complete, unacknowledged blocker on today's job
 assert.ok(bySubject['invoices:inv_past'].rank<bySubject['invoices:inv_soon'].rank);
 assert.ok(bySubject['invoices:inv_past'].rank<bySubject['invoices:inv_nojob'].rank); // same due state: complete beats missing_data
 assert.ok(bySubject['invoices:inv_nojob'].rank<bySubject['invoices:inv_soon'].rank); // a past-due partial case still outranks a not-yet-due one
 for(const r of p.ranked){assert.ok(r.reasons.includes('financial_exposure:not_estimated'));assert.ok(r.reasons.includes('confidence:not_scored'));assert.ok(r.reasons.every(x=>typeof x==='string'))}
 assert.deepEqual(pr.prioritizeCases({cases:all,now:NOW}),p);
 const twin=all.map(c=>({...c,caseId:c.caseId+'_b',dedupeKey:c.dedupeKey+'|b'}));
 const tied=pr.prioritizeCases({cases:[...all,...twin],now:NOW});
 assert.ok(tied.ranked.every(r=>r.tie===true&&r.uncertainty==='equal_priority_unresolved'));
 assert.equal(tied.ranked[0].rank,tied.ranked[1].rank);assert.equal(tied.ranked[2].rank,3);
});
test('explicit goals, learning hints and freshness adjust scores by bounded amounts; exclusions are explained',async()=>{
 const all=await allCases();
 const base=pr.prioritizeCases({cases:all,now:NOW});
 const goal=pr.prioritizeCases({cases:all,now:NOW,goals:['sales_follow_up']});
 const q=id=>goal.ranked.find(r=>r.subjectKey===id).score-base.ranked.find(r=>r.subjectKey===id).score;
 assert.equal(q('quotes:q_1'),10);assert.equal(q('invoices:inv_past'),0);
 assert.throws(()=>pr.prioritizeCases({cases:all,goals:['maximize_profit']}),/explicitly configured/);
 const lesson=await cases.recordRecommendationFeedback({caseFile:all[0],feedback:'rejected',scope:scope(),now:NOW});
 const hinted=cases.applyLearningHints({cases:all,candidates:[lesson],now:NOW});
 const h=pr.prioritizeCases({cases:hinted,now:NOW});
 assert.equal(h.ranked.find(r=>r.caseId===all[0].caseId).score,base.ranked.find(r=>r.caseId===all[0].caseId).score-10);
 const stale=pr.prioritizeCases({cases:all,now:'2026-11-10T22:30:00.000Z'});
 assert.equal(stale.ranked[0].score,base.ranked[0].score-5);
 const ex=pr.prioritizeCases({cases:[...all,{...all[0],status:'superseded'},{...all[0],caseId:'pcase_copy'},{kind:'other'},{...all[1],executionAuthority:true}],now:NOW,resolvedCaseIds:[all[2].caseId],tenantId:business});
 assert.deepEqual(ex.excluded.map(e=>e.reason).sort(),['already_resolved','duplicate_dedupe_key','invalid_or_authority_bearing_case','invalid_or_authority_bearing_case','status:superseded'].sort());
 const expired=pr.prioritizeCases({cases:all,now:'2026-11-12T00:00:00.000Z'});
 assert.equal(expired.ranked.length,0);assert.ok(expired.excluded.every(e=>e.reason==='expired'));
 const foreign=pr.prioritizeCases({cases:all,now:NOW,tenantId:'business_002'});
 assert.ok(foreign.excluded.every(e=>e.reason==='foreign_tenant'));
});
test('proposal preconditions block on every missing guarantee and prepare only an unexecuted proposal when all pass',async()=>{
 const all=await allCases();
 const past=all.find(c=>c.subjectKey==='invoices:inv_past');
 const ok=pr.validateProposalPreconditions({caseFile:past,scope:scope(),commandCatalog:registry.definitions,currentRefs:records(),existingProposals:[],due:'2026-11-12'});
 assert.equal(ok.status,'eligible');assert.ok(Object.values(ok.checks).every(c=>c.ok));
 assert.equal(ok.proposal.status,'proposed_not_authorized');assert.equal(ok.proposal.delegationEligible,false);assert.equal(ok.proposal.receiptRef,null);assert.equal(ok.proposal.automationMode,'advisory');
 const blocked=(over,key,detail)=>{const r=pr.validateProposalPreconditions({caseFile:past,scope:scope(),commandCatalog:registry.definitions,currentRefs:records(),existingProposals:[],due:'2026-11-12',...over});assert.equal(r.status,'blocked',key);assert.equal(r.checks[key].ok,false);if(detail)assert.match(r.checks[key].detail,detail);assert.equal(r.proposal,null)};
 blocked({scope:scope({role:'member'})},'actor_permitted',/role_cannot_approve/);
 blocked({scope:scope({identity:{issuer,subject:'other'}})},'actor_permitted',/case_actor_differs/);
 blocked({scope:scope({businessId:'business_002'})},'tenant_matches');
 blocked({currentRefs:records().map(r=>r.id==='inv_past'?{...r,revision:9}:r)},'revision_current',/inv_past/);
 blocked({currentRefs:records().filter(r=>r.id!=='inv_past')},'revision_current');
 blocked({currentRefs:null},'revision_current',/not_supplied/);
 blocked({commandCatalog:[]},'command_exists',/command_not_registered/);
 blocked({commandCatalog:registry.definitions.map(d=>d.id==='invoice.followup.schedule'?{...d,approval:'none'}:d)},'approval_mechanism');
 blocked({commandCatalog:registry.definitions.map(d=>d.id==='invoice.followup.schedule'?{...d,effect:'external_message'}:d)},'external_effects');
 blocked({due:'2026-02-30'},'parameters_valid');
 blocked({automationMode:'unlimited'},'automation_setting');
 blocked({existingProposals:[{caseId:past.caseId,commandId:'invoice.followup.schedule',status:'proposed_not_authorized'}]},'not_duplicate');
 const incomplete=all.find(c=>c.subjectKey==='invoices:inv_nojob');
 const r=pr.validateProposalPreconditions({caseFile:incomplete,scope:scope(),commandCatalog:registry.definitions,currentRefs:records(),existingProposals:[],due:'2026-11-12'});
 assert.equal(r.status,'blocked');assert.equal(r.checks.evidence_complete.ok,false);
 const noCommand=all.find(c=>c.detectorId==='job.crew_double_booking')||all.find(c=>c.detectorId==='job.field_blocker_unacknowledged');
 const b=pr.validateProposalPreconditions({caseFile:{...noCommand,detectorId:'job.crew_double_booking'},scope:scope(),commandCatalog:registry.definitions,currentRefs:records(),existingProposals:[]});
 assert.equal(b.checks.command_exists.ok,false);
 for(const mode of ['assisted','full']){const m=pr.validateProposalPreconditions({caseFile:past,scope:scope(),commandCatalog:registry.definitions,currentRefs:records(),existingProposals:[],due:'2026-11-12',automationMode:mode});assert.equal(m.proposal.status,'proposed_not_authorized');assert.equal(m.proposal.delegationEligible,false)}
});
