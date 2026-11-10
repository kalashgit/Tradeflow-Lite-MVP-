'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let gov,cases;
before(async()=>{gov=await import('../public/intelligence-learning-governance.js');cases=await import('../public/intelligence-proactive-cases.js')});
const NOW='2026-11-10T09:00:00.000Z',AS_OF='2026-11-10';
const issuer='https://identity.example.test';
const identity=(subject='owner_001')=>({issuer,subject});
const scope=(over={})=>({mode:'cloud',businessId:'business_001',role:'owner',identity:identity(),...over});
const row=(type,id,revision,record)=>({type,id,revision,updatedAt:'2026-11-09T00:00:00Z',provenance:'tenant_record',contentTrust:'untrusted_record_content',record});
const records=()=>[row('invoices','inv_1',3,{status:'Issued',customerId:'c_1',jobId:'job_1',dueDate:'2026-11-05',currency:'USD'}),row('jobs','job_1',2,{title:'Fitout',status:'Scheduled',customerId:'c_1'})];
const context=(tenant='business_001')=>({kind:'tradeflow.intelligence.context.v1',businessId:tenant,identity:identity(),scope:{company:true},permission:{role:'owner'},readOnly:true,executionAuthority:false,records:records()});
async function governed(feedback='rejected',over={}){
 const c=(await cases.detectInvoiceDueDateReview({context:context(),scope:scope(),asOfDate:AS_OF,now:NOW})).cases[0];
 const candidate=await cases.recordRecommendationFeedback({caseFile:c,feedback,scope:scope(),note:'Customer pays net-45',now:NOW});
 return {caseFile:c,candidate,record:await gov.governLearningCandidate({candidate,caseFile:c,now:NOW,...over})};
}
test('governed record separates recommendation, feedback, receipts, measurement, unknowns, access, approval, applicability and policy effect',async()=>{
 const {record,caseFile}=await governed();
 assert.equal(record.kind,'tradeflow.intelligence.learning.governed.v1');assert.match(record.learningId,/^glearn_[a-f0-9]{24}$/);
 assert.equal(record.tenantId,'business_001');assert.deepEqual(record.actor,{subject:'owner_001',role:'owner'});
 assert.equal(record.subject.caseId,caseFile.caseId);assert.deepEqual(record.sourceRefs.map(r=>r.type+':'+r.id+'@'+r.revision),['invoices:inv_1@3','jobs:job_1@2']);
 assert.equal(record.originalRecommendation.conclusion,'needs_review');assert.equal(record.feedback.value,'rejected');
 assert.deepEqual(record.receipts,{refs:[],verified:false});assert.equal(record.measurement.evidenceClass,'user_feedback');assert.equal(record.measurement.baseline,null);assert.equal(record.measurement.sampleCount,1);
 assert.ok(record.unknowns.includes('long_term_outcome_unobserved'));assert.equal(record.sensitivity,'tenant_confidential');assert.deepEqual(record.access.roles,['owner','admin']);
 assert.equal(record.approvalState,'unreviewed');assert.equal(record.applicability.generalizes,false);assert.equal(record.policyEffect,'none');assert.equal(record.authorityChange,false);
 assert.equal(record.permissionEffect,'none');assert.equal(record.financialCertaintyEffect,'none');assert.equal(record.executionAuthority,false);assert.equal(record.expiresAt,'2027-02-08T09:00:00.000Z');
 assert.ok(Object.isFrozen(record)&&Object.isFrozen(record.applicability));
 const explained=gov.explainLearning(record);
 assert.ok(explained.supportedBy.some(s=>/owner feedback "rejected"/.test(s))&&explained.supportedBy.includes('invoices:inv_1@3'));
 assert.ok(explained.doesNot.includes('grant execution authority'));
});
test('learning stays inside its tenant and roles; viewers, members and other tenants cannot read or correct it',async()=>{
 const {record}=await governed();
 assert.equal(gov.readLearning({record,scope:scope()}).status,'ok');
 assert.equal(gov.readLearning({record,scope:scope({role:'admin'})}).status,'ok');
 assert.deepEqual(gov.readLearning({record,scope:scope({role:'member'})}),{status:'denied',reason:'role_not_permitted'});
 assert.deepEqual(gov.readLearning({record,scope:scope({role:'viewer'})}),{status:'denied',reason:'role_not_permitted'});
 assert.deepEqual(gov.readLearning({record,scope:scope({businessId:'business_002'})}),{status:'denied',reason:'foreign_tenant'});
 assert.equal(gov.readLearning({record:{...record,executionAuthority:true},scope:scope()}).status,'invalid');
 await assert.rejects(gov.correctLearning({record,scope:scope({businessId:'business_002'}),feedback:'accepted'}),/foreign_tenant/);
 await assert.rejects(gov.correctLearning({record,scope:scope({role:'member'}),feedback:'accepted'}),/role_not_permitted/);
});
test('correction creates a new unreviewed version with lineage; withdrawal invalidates; the original is untouched',async()=>{
 const {record}=await governed();
 const corrected=await gov.correctLearning({record,scope:scope(),feedback:'corrected',note:'Only this customer; others pay on time',now:'2026-11-11T09:00:00.000Z'});
 assert.equal(corrected.version,2);assert.equal(corrected.supersedes,record.learningId);assert.notEqual(corrected.learningId,record.learningId);
 assert.equal(corrected.feedback.value,'corrected');assert.equal(corrected.feedback.note.trust,'user_supplied_untrusted');assert.equal(corrected.approvalState,'unreviewed');
 assert.deepEqual(corrected.corrections,[{at:'2026-11-11T09:00:00.000Z',by:'owner_001',from:'rejected',to:'corrected'}]);
 assert.equal(record.feedback.value,'rejected');assert.equal(record.version,1);
 const withdrawn=await gov.correctLearning({record:corrected,scope:scope(),feedback:'withdrawn',now:'2026-11-12T09:00:00.000Z'});
 assert.equal(gov.learningStatus({record:withdrawn,now:'2026-11-12T10:00:00.000Z'}),'withdrawn');
 await assert.rejects(gov.correctLearning({record,scope:scope(),feedback:'approve_everything'}),/Unsupported/);
});
test('learning expires, is invalidated when source revisions change, and never changes authority or records',async()=>{
 const {record}=await governed();
 assert.equal(gov.learningStatus({record,now:NOW}),'active');
 assert.equal(gov.learningStatus({record,now:'2027-02-08T09:00:00.000Z'}),'expired');
 const same=gov.invalidateLearningOnRevision({record,currentRefs:records(),now:NOW});assert.equal(same,record);
 const bumped=gov.invalidateLearningOnRevision({record,currentRefs:records().map(r=>r.id==='inv_1'?{...r,revision:4}:r),now:NOW});
 assert.equal(bumped.invalidation.status,'invalidated');assert.match(bumped.invalidation.reason,/invoices:inv_1/);assert.equal(gov.learningStatus({record:bumped,now:NOW}),'invalidated');
 const removed=gov.invalidateLearningOnRevision({record,currentRefs:records().filter(r=>r.id!=='inv_1'),now:NOW});
 assert.equal(removed.invalidation.status,'invalidated');
 for(const r of [record,bumped,removed]){assert.equal(r.executionAuthority,false);assert.equal(r.policyEffect,'none');assert.equal(r.permissionEffect,'none');assert.equal(r.financialCertaintyEffect,'none')}
 assert.deepEqual(records()[0].record.status,'Issued'); // source records are never mutated by learning
});
test('synthetic outcomes are labelled and cannot count as real improvement; receipts require references',async()=>{
 const {record}=await governed('accepted',{evidenceClass:'synthetic_simulation'});
 assert.equal(record.measurement.evidenceClass,'synthetic_simulation');assert.equal(record.measurement.realBusinessImprovement,null);
 assert.ok(record.measurement.limitations.some(l=>/Synthetic simulation is not evidence/.test(l)));
 const {candidate,caseFile}=await governed('accepted');
 await assert.rejects(gov.governLearningCandidate({candidate,caseFile,evidenceClass:'verified_receipt'}),/requires at least one receipt/);
 await assert.rejects(gov.governLearningCandidate({candidate,caseFile,evidenceClass:'model_claim'}),/Unknown evidence class/);
 const foreignCase={...caseFile,tenantId:'business_002'};
 await assert.rejects(gov.governLearningCandidate({candidate,caseFile:foreignCase}),/same tenant/);
 await assert.rejects(gov.governLearningCandidate({candidate:{...candidate,scope:'global'},caseFile}),/tenant-only/);
});
test('aggregation reports per-subject counts and refuses to promote a correlation into a universal rule',async()=>{
 const a=await governed('rejected');
 const second=await (async()=>{const c=(await cases.detectInvoiceDueDateReview({context:{...context(),records:records().map(r=>r.id==='inv_1'?{...r,id:'inv_2',record:{...r.record}}:r)},scope:scope(),asOfDate:AS_OF,now:NOW})).cases[0];const cand=await cases.recordRecommendationFeedback({caseFile:c,feedback:'rejected',scope:scope(),now:NOW});return gov.governLearningCandidate({candidate:cand,caseFile:c,now:NOW})})();
 const agg=gov.aggregateLearning({records:[a.record,second,{...a.record,tenantId:'business_002'}],tenantId:'business_001',now:NOW});
 assert.equal(agg.activeRecords,2);assert.equal(agg.subjects.length,2);
 assert.ok(agg.detectors.every(d=>d.universalRuleEligible===false));assert.equal(agg.detectors[0].suggestedNextStep,'keep_collecting_per_subject_feedback');
 assert.equal(agg.policyEffect,'none');assert.equal(agg.executionAuthority,false);
 const expiredAgg=gov.aggregateLearning({records:[a.record],tenantId:'business_001',now:'2027-03-01T00:00:00.000Z'});
 assert.equal(expiredAgg.activeRecords,0);
});
