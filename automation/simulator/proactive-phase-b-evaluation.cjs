'use strict';
// T01 Phase B: twenty synthetic proactive-intelligence scenarios across the 5/12/20-person firms.
// Memory-only except S20, which uses the EXISTING device-local command path in the shared test host
// (tests/helpers/local-db.cjs) to produce a real persisted receipt. No browser, Worker, model or tenant.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const businesses=require('./businesses.v1.json');
const overlay=require('./proactive-scenarios.v1.json');
const businessEvents=require('../../public/business-events.js');
const registry=require('../../public/command-registry.js');
const core=require('../../public/core-integration.js');
const {createDB,snapshot}=require('../../tests/helpers/local-db.cjs');

const AS_OF=overlay.asOfDate,NOW=overlay.now,ISSUER='https://synthetic.tradeflow.test';
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const must=(ok,msg)=>{if(!ok)throw Error(msg)};
const tenantOf=id=>'sim_'+id.replaceAll('-','_');
async function mods(root=path.resolve(__dirname,'../..')){
 const load=n=>import(pathToFileURL(path.join(root,'public',n)).href);
 const [evidence,cases,ops,pr,ev,gov,ad]=await Promise.all(['intelligence-evidence.js','intelligence-proactive-cases.js','intelligence-proactive-operations.js','intelligence-proactive-priority.js','intelligence-proactive-events.js','intelligence-learning-governance.js','intelligence-proactive-adapter.js'].map(load));
 return {evidence,cases,ops,pr,ev,gov,ad};
}
function firm(id){
 const base=businesses.businesses.find(b=>b.id===id),o=overlay.overlays[id];
 must(base&&o&&base.name.includes('SYNTHETIC')&&overlay.synthetic===true,'Synthetic firm required: '+id);
 return {id,employees:base.employees,...o};
}
function context(f,evidence,{role='owner',subject,revision=1}={}){
 const tenant=tenantOf(f.id),identity={issuer:ISSUER,subject:subject||'sim_owner_'+f.employees},records=[];
 for(const type of evidence.evidenceTypes(role))for(const raw of f[type]||[]){const {id,...rest}=raw;records.push({type,id,revision,updatedAt:'2026-11-09T00:00:00Z',provenance:'tenant_record',contentTrust:'untrusted_record_content',record:evidence.projectEvidenceRecord(type,rest)})}
 return {context:{kind:'tradeflow.intelligence.context.v1',businessId:tenant,identity,scope:{company:true},readOnly:true,permission:{role},records,executionAuthority:false},scope:{mode:'cloud',businessId:tenant,role,identity,synthetic:true}};
}
const packet=(tenant,subject,recordRefs)=>({kind:'tradeflow.financial.evidence.v1',status:'missing_data',sourceKind:'verified_tenant_record',scope:{businessId:tenant,actor:{issuer:ISSUER,subject,role:'owner'},threadId:null,jobId:null},asOfDate:AS_OF,businessTimeZone:null,period:{startDate:AS_OF,endDate:'2026-11-23'},observedAt:NOW,currency:'USD',amountUnit:'minor_cents',cash:{availableMinor:null,bankVerified:false,refs:[]},receivables:{openMinor:null,settlementVerified:false,refs:[]},obligations:[],obligationsComplete:false,coverage:{payroll:'unknown',suppliers:'unknown',bank:'unverified'},recordRefs,missingData:['verified_bank_availability','supplier_commitment_completeness','payroll_schedule_and_taxes_benefits'],afterObligationsMinor:null,contentTrust:'untrusted_record_content',providerSettlementVerified:false,limitations:[],readOnly:true,executionAuthority:false});

async function run({root}={}){
 const m=await mods(root);const {evidence,cases,ops,pr,ev,gov,ad}=m;
 const results=[],failures=[];let modelCalls=0,leaks=0,unauthorized=0,externalActions=0;
 const scenario=(id,title,ok,detail)=>{results.push({id,title,status:ok?'PASS':'FAIL',detail});if(!ok)failures.push({id,detail})};
 const guard=r=>{if(r?.modelInvoked)modelCalls++;for(const c of r?.cases||[]){if(c.executionAuthority!==false||c.proposals.length)unauthorized++}};
 const f5=firm('TF-SIM-05'),f12=firm('TF-SIM-12'),f20=firm('TF-SIM-20');
 const c5=context(f5,evidence),c12=context(f12,evidence),c20=context(f20,evidence);
 const names=[...f5.customers,...f12.customers,...f20.customers].map(c=>c.name);
 const noLeak=x=>{const t=JSON.stringify(x);for(const n of names)if(t.includes(n))leaks++;if(/\$\s?\d/.test(t))leaks++};
 const r5=await ops.detectCrewMaterialReadiness({...c5,asOfDate:AS_OF,now:NOW});guard(r5);noLeak(r5);
 const r12=await ops.detectCrewMaterialReadiness({...c12,asOfDate:AS_OF,now:NOW});guard(r12);noLeak(r12);
 const r20=await ops.detectCrewMaterialReadiness({...c20,asOfDate:AS_OF,now:NOW});guard(r20);noLeak(r20);
 const q5=await ops.detectQuoteFollowUp({...c5,asOfDate:AS_OF,now:NOW});guard(q5);noLeak(q5);
 const i5=await cases.detectInvoiceDueDateReview({...c5,asOfDate:AS_OF,now:NOW});guard(i5);noLeak(i5);
 const by=(r,d,key)=>r.cases.filter(c=>c.detectorId===d&&(!key||c.subjectKey===key));
 // S01 material shortage reported but not acknowledged
 const blocker=by(r5,'job.field_blocker_unacknowledged')[0];
 scenario('S01','Material shortage reported but not acknowledged',!!blocker&&blocker.evidence.acknowledgment==='none_recorded'&&blocker.conclusion==='missing_data'&&blocker.missingData.includes('synthetic_evidence_only')&&blocker.evidence.noteWithheld===true,blocker?{severity:blocker.severity,missingData:blocker.missingData}:'no case');
 const acked=structuredClone(c5);const job=acked.context.records.find(r=>r.id==='j-101');job.revision=2;job.record.fieldUpdates.push({eventId:'evt-102',kind:'job_blocker_acknowledged',actorId:'sim_office_05',at:'2026-11-10T08:30:00Z',acknowledgesEventId:'evt-101'});
 const r5b=await ops.detectCrewMaterialReadiness({...acked,asOfDate:AS_OF,now:NOW});guard(r5b);
 const st=cases.reconcileCases({existing:ops.splitEvaluation(r5).find(e=>e.detectorId==='job.field_blocker_unacknowledged').cases,evaluation:ops.splitEvaluation(r5b).find(e=>e.detectorId==='job.field_blocker_unacknowledged'),now:NOW});
 scenario('S01b','Blocker resolved only by recorded acknowledgment',by(r5b,'job.field_blocker_unacknowledged').length===0&&st.superseded[0]?.supersedeReason==='resolved:acknowledged',st.superseded.map(c=>c.supersedeReason));
 // S02 crew assignment conflict (12-person): j-201 07:00+480 overlaps j-202 13:00; j-203 untimed on another day
 const conflict=by(r12,'job.crew_double_booking');
 scenario('S02','Crew assignment conflict',conflict.length===1&&conflict[0].evidence.overlapDetermined===true&&conflict[0].conclusion==='missing_data'&&by(r20,'job.crew_double_booking').length===0,conflict.map(c=>c.subjectKey));
 // S03 offline field update awaiting synchronization
 const domainEvent=businessEvents.make({store:'jobs',record:{id:'j-101',status:'In Progress'},previous:{id:'j-101',status:'Planned'},key:'gui:sim-1',context:{businessId:tenantOf('TF-SIM-05'),actor:'sim_owner_5'},at:NOW});
 const trigger=ev.triggerFromDomainEvent({...domainEvent,evidence:'server_commit',status:'processed'},{tenantId:tenantOf('TF-SIM-05'),detectedAt:NOW});
 const pending=await ops.detectCrewMaterialReadiness({...c5,asOfDate:AS_OF,now:NOW,trigger});guard(pending);
 // Synthetic scope keeps the lowest trust label; the trigger itself proves the event stayed local_pending despite forged fields.
 scenario('S03','Offline field update awaiting synchronization',trigger.source==='local_pending'&&trigger.confirmed===false&&trigger.actorScope==='local_only'&&pending.evidenceTrust==='synthetic'&&pending.cases.every(c=>c.conclusion==='missing_data'&&c.triggerSource==='local_pending')&&ev.classifyTrigger(trigger).evidenceClass==='local_unconfirmed',{source:trigger.source,claimed:trigger.claimedEvidence});
 // S04 duplicate purchase request; S05 missing supplier ETA
 const dup=by(r5,'job.material_order_review').find(c=>c.subjectKey.includes('supplier:sup-101'));
 scenario('S04','Duplicate purchase request',!!dup&&dup.evidence.duplicateConfirmed===false&&dup.conclusion==='missing_data',dup?.subjectKey);
 const eta=by(r20,'job.material_order_review','jobs:j-301|supplyOrders:po-301')[0];
 scenario('S05','Missing supplier ETA',!!eta&&eta.missingData.includes('supplier_eta_unrecorded')&&eta.evidence.plannedDate===null&&cases.prepareInternalProposal({caseFile:eta,commandCatalog:registry.definitions}).status==='unsupported_capability',eta?.missingData);
 // S06 quote with verified overdue follow-up; S07 quote without sent timestamp; S08 customer opted out
 const q101=by(q5,'quotation.follow_up_review','quotes:q-101')[0],q102=by(q5,'quotation.follow_up_review','quotes:q-102')[0];
 scenario('S06','Quote with verified overdue follow-up',!!q101&&q101.evidence.followUpDue===true&&q101.evidence.daysSinceLastTouch===20&&q101.conclusion==='missing_data',q101?{days:q101.evidence.daysSinceLastTouch,trust:q101.evidenceTrust}:'no case');
 scenario('S07','Quote without a sent timestamp',!!q102&&q102.missingData.includes('sent_timestamp')&&q102.evidence.followUpDue===null,q102?.missingData);
 scenario('S08','Customer opted out of communications',!!q101&&q101.evidence.contactRestricted===true&&/No outreach of any kind/.test(q101.recommendation)&&q101.priorityReasons.includes('contact_restriction:restricted')&&cases.prepareInternalProposal({caseFile:{...q101,evidenceTrust:'authorized_current_record',conclusion:'needs_review',missingData:[]},commandCatalog:registry.definitions,due:'2026-11-12'}).customerContact==='not_proposed',q101?.evidence.contactRestriction);
 // S09 invoice approaching due date; S10 financial evidence gap
 const inv=by(i5,'invoice.due_date_review')[0];
 scenario('S09','Invoice approaching its recorded due date',!!inv&&inv.evidence.dueState==='approaching'&&inv.evidence.daysUntilDue===4&&inv.severity==='informational',inv?.evidence.dueState);
 const fin=await cases.detectCashCoverageEvidenceGap({packet:packet(tenantOf('TF-SIM-05'),'sim_owner_5',[{type:'invoices',id:'i-101',revision:1,updatedAt:NOW}]),scope:c5.scope,asOfDate:AS_OF,now:NOW});guard(fin);noLeak(fin);
 scenario('S10','Financial evidence missing bank and supplier coverage',fin.cases.length===1&&fin.cases[0].evidence.forecast===null&&fin.cases[0].missingData.includes('supplier_commitment_completeness'),fin.cases[0]?.missingData);
 // S11 replayed identical domain event x50
 let state=cases.reconcileCases({existing:[],evaluation:ops.splitEvaluation(pending).find(e=>e.detectorId==='job.field_blocker_unacknowledged'),now:NOW});let newCases=0;
 for(let i=0;i<50;i++){const t=ev.triggerFromDomainEvent(domainEvent,{tenantId:tenantOf('TF-SIM-05'),detectedAt:NOW});const r=await ops.detectCrewMaterialReadiness({...c5,asOfDate:AS_OF,now:NOW,trigger:t});state=cases.reconcileCases({existing:state.active,evaluation:ops.splitEvaluation(r).find(e=>e.detectorId==='job.field_blocker_unacknowledged'),now:NOW});newCases+=state.newCaseIds.length}
 scenario('S11','Replayed identical domain event 50 times',state.active.length===1&&newCases===0,{active:state.active.length,newCases});
 // S12 revoked actor after detection
 const viewerScope={...c5.scope,role:'viewer'};
 const revoked=pr.validateProposalPreconditions({caseFile:blocker,scope:viewerScope,commandCatalog:registry.definitions,currentRefs:c5.context.records,existingProposals:[]});
 scenario('S12','Revoked actor after detection',revoked.status==='blocked'&&revoked.checks.actor_permitted.ok===false&&cases.inspectProactiveCase({caseFile:blocker,scope:viewerScope,now:NOW}).status==='access_denied',revoked.checks.actor_permitted);
 // S13 foreign tenant case injection
 const foreign={...blocker,caseId:blocker.caseId};const twin=context({...f5,id:'TF-SIM-05B'},evidence);
 const r5twin=await ops.detectCrewMaterialReadiness({...twin,asOfDate:AS_OF,now:NOW});
 const merged=cases.reconcileCases({existing:[blocker],evaluation:ops.splitEvaluation(r5twin).find(e=>e.detectorId==='job.field_blocker_unacknowledged'),now:NOW});
 let adapterRefused=false;try{ad.buildProactiveTurn({cases:[blocker,r5twin.cases[0]],scope:c5.scope,now:NOW})}catch{adapterRefused=true}
 scenario('S13','Foreign tenant case injection',merged.active.length===2&&merged.superseded.length===0&&pr.prioritizeCases({cases:[blocker,...r5twin.cases],now:NOW,tenantId:tenantOf('TF-SIM-05')}).excluded.every(e=>e.reason==='foreign_tenant')&&adapterRefused,{active:merged.active.length,adapterRefused});
 // S14 stale source revision
 const bumped=c5.context.records.map(r=>r.id==='j-101'?{...r,revision:7}:r);
 const inspect=cases.inspectProactiveCase({caseFile:blocker,scope:c5.scope,now:NOW,currentRefs:bumped});
 scenario('S14','Stale source revision',inspect.status==='stale_evidence'&&pr.validateProposalPreconditions({caseFile:blocker,scope:c5.scope,commandCatalog:registry.definitions,currentRefs:bumped,existingProposals:[]}).checks.revision_current.ok===false,inspect);
 // S15 expired learning candidate; S16 rejected recommendation
 const lesson=await cases.recordRecommendationFeedback({caseFile:blocker,feedback:'rejected',scope:c5.scope,note:'Synthetic: crew already has the parts',now:NOW});
 const governed=await gov.governLearningCandidate({candidate:lesson,caseFile:blocker,now:NOW,evidenceClass:'synthetic_simulation'});
 scenario('S15','Expired learning candidate',gov.learningStatus({record:governed,now:'2027-03-01T00:00:00.000Z'})==='expired'&&cases.applyLearningHints({cases:[blocker],candidates:[lesson],now:'2027-03-01T00:00:00.000Z'})[0].learningHints.length===0,{expiresAt:governed.expiresAt});
 const hinted=cases.applyLearningHints({cases:[blocker],candidates:[lesson],now:NOW})[0];
 scenario('S16','Rejected recommendation',hinted.learningHints.length===1&&hinted.severity===blocker.severity&&hinted.conclusion===blocker.conclusion&&governed.policyEffect==='none'&&governed.applicability.generalizes===false&&governed.measurement.realBusinessImprovement===null,{hints:hinted.learningHints.length,evidenceClass:governed.measurement.evidenceClass});
 // S17 contradictory evidence: follow-up touch after as-of date; impossible invoice due date
 const contradictory=structuredClone(c5);contradictory.context.records.find(r=>r.id==='q-101').record.lastFollowUpAt='2026-12-01T00:00:00Z';contradictory.context.records.find(r=>r.id==='i-101').record.dueDate='2026-02-30';
 const cq=await ops.detectQuoteFollowUp({...contradictory,asOfDate:AS_OF,now:NOW}),ci=await cases.detectInvoiceDueDateReview({...contradictory,asOfDate:AS_OF,now:NOW});guard(cq);guard(ci);
 scenario('S17','Contradictory evidence',cq.unknowns.includes('quote_touch_in_future:q-101')&&!cq.cases.some(c=>c.subjectKey==='quotes:q-101')&&ci.cases.length===0&&ci.unknowns.includes('invoice_due_date_missing_or_invalid:i-101'),{quote:cq.unknowns,invoice:ci.unknowns});
 // S18 unavailable command
 const unavailable=cases.prepareInternalProposal({caseFile:{...q101,evidenceTrust:'authorized_current_record',conclusion:'needs_review',missingData:[]},commandCatalog:[],due:'2026-11-12'});
 scenario('S18','Unavailable command',unavailable.status==='unsupported_capability'&&unavailable.reason==='command_not_registered'&&cases.prepareInternalProposal({caseFile:conflict[0],commandCatalog:registry.definitions}).reason==='no_internal_command_for_schedule_change',unavailable.reason);
 // S19 uncertain action result: a tool claims success without a receipt
 const claimed={...blocker,proposals:[{proposalId:'p',commandId:'draft.prepare',status:'succeeded',receiptRef:'receipt_claimed'}]};
 let receiptRefused=false;try{await gov.governLearningCandidate({candidate:lesson,caseFile:blocker,now:NOW,evidenceClass:'verified_receipt',receiptRefs:[]})}catch{receiptRefused=true}
 const localTurn=ad.buildProactiveTurn({cases:[{...blocker,tenantId:'local-business',actor:{subject:'local-owner',role:'owner'},evidenceTrust:'local_unconfirmed'}],scope:{mode:'local',actor:'local-owner',businessId:'local-business'},now:NOW});
 scenario('S19','Uncertain action result',receiptRefused&&/Proposed \(not executed\)/.test(ad.buildProactiveTurn({cases:[{...claimed,tenantId:'local-business',actor:{subject:'local-owner',role:'owner'},evidenceTrust:'local_unconfirmed'}],scope:{mode:'local',actor:'local-owner',businessId:'local-business'},now:NOW}).turn.content)&&!localTurn.turn.content.includes('receipt_claimed'),{receiptRefused});
 // S20 verified internal action receipt through the EXISTING device-local command path (synthetic test host)
 const localDb=createDB({invoices:[{id:'i-901',customerId:'c-901',status:'Issued',dueDate:'2026-10-20',currency:'USD',taxRate:0,lines:[{description:'Panel',qty:1,unitPrice:100}],businessId:'local-business'}],customers:[{id:'c-901',name:'Local synthetic customer',businessId:'local-business'}],payments:[]});
 const localScope={mode:'local',actor:'local-owner',businessId:'local-business'};
 const localSnapshot=await snapshot(localDb);
 const localContext=await evidence.localEvidence(localSnapshot,localScope);
 const localCases=await cases.detectInvoiceDueDateReview({context:localContext,scope:localScope,asOfDate:AS_OF,now:NOW});guard(localCases);
 const localCase=localCases.cases[0];
 const localProposal=cases.prepareInternalProposal({caseFile:localCase,commandCatalog:registry.definitions,due:'2026-11-12'});
 const guardRows=registry.resolve({commandId:'invoice.followup.schedule',params:{ref:{store:'invoices',id:'i-901'},due:'2026-11-12'}},localSnapshot,{actor:'local-owner',businessId:'local-business',today:AS_OF}).guard;
 let receipt=null,readback=null;
 if(Array.isArray(guardRows)){
  // Explicit owner approval is supplied by the harness here; the proactive case itself conferred no authority.
  const result=await core.execute({db:localDb,kind:'invoice.followup.schedule',uid:()=>'sim-task-901',payload:{invoiceId:'i-901',due:'2026-11-12'},requestKey:'sim-approve-901',actor:'local-owner',businessId:'local-business',approved:true,recordGuard:guardRows});
  readback=await snapshot(localDb);
  const log=readback.commandLog.find(x=>x.kind==='invoice.followup.schedule');
  receipt=log&&readback.tasks.find(t=>t.id===result.id)?{commandLogId:log.id,taskId:result.id,reused:result.reused}:null;
 }
 let governedReceipt=null;
 if(receipt){const l=await cases.recordRecommendationFeedback({caseFile:localCase,feedback:'accepted',scope:localScope,now:NOW});governedReceipt=await gov.governLearningCandidate({candidate:l,caseFile:localCase,now:NOW,evidenceClass:'verified_receipt',receiptRefs:['commandLog:'+receipt.commandLogId]})}
 scenario('S20','Verified internal action receipt (existing device-local command path)',!!receipt&&receipt.reused===false&&readback.tasks.length===1&&readback.tasks[0].taskKind==='invoice_follow_up'&&readback.invoices[0].status==='Issued'&&localProposal.status==='unsupported_capability'&&['evidence_incomplete','evidence_not_server_confirmed'].includes(localProposal.reason)&&governedReceipt?.receipts.verified===true,
  {proposalFromCase:localProposal.status+'/'+localProposal.reason,receipt,note:'Approval came from the harness acting as owner through the existing command runtime, not from the proactive case.'});
 // Presentation sanity for the whole 5-person firm
 const all=[...r5.cases,...q5.cases,...i5.cases,...fin.cases];
 const priority=pr.prioritizeCases({cases:all,now:NOW});
 const turn=ad.buildProactiveTurn({cases:all.map(c=>({...c,evidenceTrust:'local_unconfirmed',tenantId:'local-business',actor:{subject:'local-owner',role:'owner'}})),scope:localScope,now:NOW,priority});
 noLeak(turn);
 scenario('S21','Prioritized read-only turn for the firm',priority.ranked.length===all.length&&turn.turn.content.length<=6000&&turn.caseIndex.length===Math.min(5,all.length)&&turn.executionAuthority===false,{ranked:priority.ranked.map(r=>[r.rank,r.score,r.subjectKey])});
 const scorecard={syntheticOnly:true,appModulesObserved:true,localCommandPathObserved:true,browserObserved:false,workerObserved:false,authenticatedTenantObserved:false,modelObserved:false,
  scenarios:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:failures.length,tenantLeakCount:leaks,unauthorizedActionCount:unauthorized+externalActions,modelCallCount:modelCalls,
  verifiedReceipts:receipt?1:0,realBusinessImprovement:null,alertPrecisionBaseline:null,
  limitations:['Synthetic overlay fixtures only.','S20 exercises the existing device-local command host, not an authenticated Worker; approval was supplied by the harness as the owner.','No browser, voice, provider or physical device involved.']};
 return {status:failures.length?'FAILED':'PASSED',asOfDate:AS_OF,fixtureHash:digest([businesses,overlay]),results,failures,scorecard};
}
module.exports={run,firm,context,AS_OF,NOW};
if(require.main===module){
 run().then(r=>{const dir=path.resolve(process.env.T01_EVIDENCE_DIR||'artifacts/t01-proactive');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'phase-b-evaluation.json'),JSON.stringify(r,null,1));
  console.log(JSON.stringify({status:r.status,scorecard:r.scorecard,results:r.results.map(x=>x.id+':'+x.status)},null,1));process.exit(r.status==='PASSED'?0:1)}).catch(e=>{console.error(e);process.exit(2)});
}
