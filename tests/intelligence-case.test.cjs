
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let mod;test.before(async()=>{mod=await import('../public/intelligence-case.js')});
const scope=()=>({mode:'local',actor:'local-owner',businessId:'local-business',jobId:'job_01',today:'2026-11-03'});
const source=()=>({type:'jobs',id:'job_01',revision:null,contentHash:'a'.repeat(64),provenance:'local_device_record'});
function fixture(){
 const record=source();
 const decision={kind:'tradeflow.decision.v1',binding:'b'.repeat(64),status:'ready_for_review',evidenceMode:'device_local_unverified_identity',
  workflow:{records:[record]},observations:[{id:'finding_01',detectorId:'job.labor_hours_variance_review',refs:[record],priority:{band:'normal'}}],
  proposals:[{id:'review_01',commandId:'job.labor_review.schedule',requiresApproval:true,externalEffects:false}],
  unknowns:[{code:'payroll_unverified'},{code:'payroll_unverified'}]};
 return {decision,scope:scope(),threadId:'thread_01',asOf:'2026-11-03T10:00:00.000Z'};
}
test('bounded case reuses existing source and proposal IDs with zero action authority',()=>{
 const f=fixture(),c=mod.createIntelligenceCase(f);
 assert.equal(c.kind,'tradeflow.intelligence.case.v1');assert.equal(c.status,'owner_review_available');
 assert.equal(c.sourceMode,'device_local_unverified');assert.equal(c.sources[0].contentHash,'a'.repeat(64));
 assert.equal(c.proposals[0].commandId,'job.labor_review.schedule');assert.equal(c.proposals[0].receiptRef,null);
 assert.equal(c.unknowns.length,1);assert.equal(c.executionAuthority,false);assert.equal(c.modelCalls,0);assert.equal(c.persistence,'in_memory_derived');
 assert.ok(Object.isFrozen(c));assert.ok(Object.isFrozen(c.sources[0]));
});
test('case is valid only for the same current evidence, actor, business, job and thread',()=>{
 const f=fixture(),c=mod.createIntelligenceCase(f);
 const check=x=>mod.inspectIntelligenceCase({...f,caseFile:c,accessGranted:true,...x});
 assert.equal(check().status,'current');
 assert.equal(check({accessGranted:false}).status,'access_unverified');
 assert.equal(check({scope:{...f.scope,businessId:'another-business'}}).status,'scope_changed');
 assert.equal(check({scope:{...f.scope,actor:'crew'}}).status,'scope_changed');
 assert.equal(check({scope:{...f.scope,jobId:'other_job'}}).status,'scope_changed');
 assert.equal(check({threadId:'thread_02'}).status,'thread_changed');
 assert.equal(check({decision:{...f.decision,binding:'c'.repeat(64)}}).status,'stale_evidence');
 assert.equal(check({decision:{...f.decision,workflow:{records:[{...source(),contentHash:'c'.repeat(64)}]}}}).status,'stale_evidence');
});
test('case expiration, interruption and fresh inspection do not create durable authority',()=>{
 const f=fixture(),c=mod.createIntelligenceCase(f),check=asOf=>mod.inspectIntelligenceCase({...f,caseFile:c,asOf,accessGranted:true});
 assert.equal(check('2026-11-03T10:09:59.999Z').status,'current');
 assert.equal(check('2026-11-03T10:10:00.000Z').status,'expired');
 assert.equal(check('2026-11-03T09:59:59.999Z').status,'invalid_time');
 assert.equal(mod.CASE_TTL_MS,600000);assert.equal(check('invalid').status,'invalid_time');
});
test('cloud evidence needs trusted revisions and role-scoped access',()=>{
 const f=fixture();f.scope={mode:'cloud',businessId:'business_01',jobId:'job_01',today:'2026-11-03',role:'member',identity:{issuer:'test',subject:'actor_01'}};
 f.decision.evidenceMode='authenticated_cloud_read';f.decision.workflow.records=[{type:'jobs',id:'job_01',revision:2,provenance:'tenant_record'}];
 const c=mod.createIntelligenceCase(f);
 assert.equal(c.sources[0].revision,2);assert.equal(c.sourceMode,'authenticated_tenant_snapshot');
 assert.equal(mod.inspectIntelligenceCase({...f,caseFile:c,accessGranted:true}).status,'current');
 assert.equal(mod.inspectIntelligenceCase({...f,caseFile:c,scope:{...f.scope,role:'viewer'},accessGranted:true}).status,'scope_changed');
 assert.throws(()=>mod.createIntelligenceCase({...f,decision:{...f.decision,workflow:{records:[{type:'jobs',id:'job_01',revision:null,provenance:'tenant_record'}]}}}),/revision/);
});
test('missing or contradictory evidence cannot be smuggled into the case',()=>{
 const f=fixture();assert.throws(()=>mod.createIntelligenceCase({...f,decision:{...f.decision,workflow:{records:[source(),source()]}}}),/Duplicate/);
 assert.throws(()=>mod.createIntelligenceCase({...f,decision:{...f.decision,observations:[{id:'wrong',detectorId:'labor',refs:[{type:'jobs',id:'foreign'}]}]}}),/source/);
 assert.throws(()=>mod.createIntelligenceCase({...f,decision:{...f.decision,proposals:[{id:'p',commandId:'invoice.send',requiresApproval:false,externalEffects:true}]}}),/explicitly reviewable/);
 assert.throws(()=>mod.createIntelligenceCase({...f,threadId:'x'.repeat(101)}),/thread/);
});
test('offline application precaches the added source module',()=>{
 const sw=fs.readFileSync('public/sw.js','utf8');
 assert.match(sw,/intelligence-case\.js/);assert.match(sw,/const CACHE='tradeflow-lite-[a-z0-9-]+'/);
});

test('fresh local case re-reads saved records rather than trusting the original decision',async()=>{
 const {localEvidence}=await import('../public/intelligence-evidence.js');
 const f=fixture(),data={jobs:[{id:'job_01',businessId:'local-business',title:'Synthetic job',status:'In Progress'}]};
 const current=await localEvidence(data,f.scope);
 f.decision.workflow.records=current.records.map(r=>({type:r.type,id:r.id,revision:r.revision,contentHash:r.contentHash,provenance:r.provenance}));
 f.decision.observations[0].refs=f.decision.workflow.records;
 const caseFile=mod.createIntelligenceCase(f);
 const check=rest=>mod.inspectCurrentLocalCase({...f,caseFile,accessGranted:true,readCurrent:async s=>localEvidence(data,s),...rest});
 assert.equal((await check()).status,'current');
 assert.equal((await check({accessGranted:false})).status,'access_unverified');
 assert.equal((await check({threadId:'other_thread'})).status,'thread_changed');
 assert.equal((await check({readCurrent:null})).status,'fresh_source_unavailable');
 data.jobs[0].status='Completed';
 assert.equal((await check()).status,'stale_evidence');
 data.jobs.length=0;
 assert.equal((await check()).status,'fresh_source_unavailable');
});
test('local freshness port cannot be misused as a cloud authentication provider',async()=>{
 const f=fixture();
 f.scope={mode:'cloud',businessId:'biz_01',jobId:'job_01',today:'2026-11-03',role:'member',identity:{issuer:'issuer_01',subject:'actor_01'}};
 f.decision.evidenceMode='authenticated_cloud_read';
 f.decision.workflow.records=[{type:'jobs',id:'job_01',revision:2,provenance:'tenant_record'}];
 f.decision.observations[0].refs=f.decision.workflow.records;
 const caseFile=mod.createIntelligenceCase(f);
 const inspected=await mod.inspectCurrentLocalCase({...f,caseFile,accessGranted:true,readCurrent:()=>{throw Error('Must not read cloud')}});
 assert.equal(inspected.status,'authenticated_refresh_unavailable');
});
