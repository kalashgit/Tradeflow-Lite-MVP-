const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/advisory-authorization.js');
const env={TF_ADVISORY_ENABLED:'true',TF_ADVISORY_PROVIDER:'mock'};
const identity=()=>({verified:true,issuer:'issuer.example',subject:'owner_001'});
const context=()=>({kind:'tradeflow.intelligence.context.v1',businessId:'business_001',
 identity:{issuer:'issuer.example',subject:'owner_001'},permission:{role:'owner'},
 scope:{jobId:'job_001'},readOnly:true,executionAuthority:false,
 records:[{type:'jobs',id:'job_001',revision:2,record:{title:'Private'}}]});
function fixture(){
 const state={role:'owner',active:true,job:true,revision:2,deleted:false,reads:0,jobReads:0,fail:false};
 const db={prepare(sql){assert.match(sql,/^SELECT/);return {bind(...args){return {async first(){
  if(state.fail)throw Error('SECRET DATABASE CONNECTION');
  if(sql.includes('FROM business_memberships')){
   state.reads++;assert.deepEqual(args,['business_001','issuer.example','owner_001','active']);
   return state.active?{role:state.role}:null;
  }
  assert.match(sql,/FROM tenant_records/);assert.match(sql,/EXISTS/);state.jobReads++;
  assert.deepEqual(args.slice(0,3),['business_001','jobs','job_001']);
  if(!state.job||!state.active)return null;
  return {revision:state.revision,deleted_at:state.deleted?'2026-10-30':null,
   payload:JSON.stringify({id:'job_001',businessId:'business_001',title:'Existing job'})};
 }}}}}};
 return {state,db};
}
const send=async()=>({text:'Evidence requires owner review'});
test('server-owned adapter rechecks actual membership and SQL job evidence at both advisory boundaries',async()=>{
 const {requestAuthorizedServerAdvisory}=await load(),f=fixture();let calls=0;
 const result=await requestAuthorizedServerAdvisory({db:f.db,principal:identity(),context:context(),env,intent:'evidence_gaps',transport:async()=>{calls++;return send()}});
 assert.equal(calls,1);assert.equal(f.state.jobReads,2);assert.equal(f.state.reads,4);
 assert.equal(result.readOnly,true);assert.equal(result.executionAuthority,false);
});
test('revocation or role downgrade during mock inference denies the result',async()=>{
 const {requestAuthorizedServerAdvisory}=await load();
 for(const change of [s=>s.active=false,s=>s.role='member']){
  const f=fixture();await assert.rejects(requestAuthorizedServerAdvisory({db:f.db,principal:identity(),context:context(),env,intent:'labor_variance',transport:async()=>{change(f.state);return send()}}),e=>e.code==='authorization_denied');
 }
});
test('unverified, switched and foreign business principals never reach transport',async()=>{
 const {requestAuthorizedServerAdvisory}=await load();
 for(const [principal,ctx] of [[{...identity(),verified:false},context()],[{...identity(),subject:'other'},context()],[identity(),{...context(),businessId:'business_002'}]]){
  const f=fixture();let calls=0;
  await assert.rejects(requestAuthorizedServerAdvisory({db:f.db,principal,context:ctx,env,intent:'cost_variance',transport:async()=>{calls++;return send()}}));
  assert.equal(calls,0);
 }
});
test('missing, deleted or stale job and incorrect job scope fail closed',async()=>{
 const {requestAuthorizedServerAdvisory}=await load();
 for(const change of [s=>s.job=false,s=>s.deleted=true,s=>s.revision=3]){
  const f=fixture();change(f.state);let calls=0;
  await assert.rejects(requestAuthorizedServerAdvisory({db:f.db,principal:identity(),context:context(),env,intent:'evidence_gaps',transport:async()=>{calls++;return send()}}),e=>e.code==='authorization_denied');
  assert.equal(calls,0);
 }
 const f=fixture(),ctx=context();ctx.scope={jobId:'job_002'};
 await assert.rejects(requestAuthorizedServerAdvisory({db:f.db,principal:identity(),context:ctx,env,intent:'evidence_gaps',transport:send}),e=>e.code==='authorization_denied');
});
test('database failures and actor mutation are masked, never returned as advisory content',async()=>{
 const {requestAuthorizedServerAdvisory}=await load();
 const f=fixture();f.state.fail=true;
 await assert.rejects(requestAuthorizedServerAdvisory({db:f.db,principal:identity(),context:context(),env,intent:'evidence_gaps',transport:send}),e=>e.code==='authorization_denied'&&!e.message.includes('SECRET'));
 const g=fixture(),principal=identity();
 await assert.rejects(requestAuthorizedServerAdvisory({db:g.db,principal,context:context(),env,intent:'evidence_gaps',transport:async()=>{principal.subject='other';return send()}}),e=>e.code==='authorization_denied');
});
test('company-scoped advisory uses existing company read policy without inventing job grants',async()=>{
 const {requestAuthorizedServerAdvisory}=await load(),f=fixture(),ctx=context();ctx.scope={company:true};ctx.records=[];
 const result=await requestAuthorizedServerAdvisory({db:f.db,principal:identity(),context:ctx,env,intent:'evidence_gaps',transport:send});
 assert.equal(result.executionAuthority,false);assert.equal(f.state.jobReads,0);assert.equal(f.state.reads,2);
});
