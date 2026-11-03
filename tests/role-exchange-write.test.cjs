'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLocalCrewReport,submitAssignedCrewBlocker}=require('../src/role-exchange.js');
const issuer='https://id.example',subject='crew_01',businessId='business_01',jobId='job_01';
const evt=overrides=>createLocalCrewReport({businessId,actorId:subject,jobId,baseRevision:3,
 note:'Two required materials are missing',eventId:'event_01',idempotencyKey:'crew_report_01',
 at:'2026-11-03T08:00:00Z',...overrides});
function fixture(options={}){
 const state={
  role:options.role||'member',active:options.active!==false,revision:options.revision??3,
  job:{id:jobId,businessId:options.foreignJob?'business_02':businessId,title:'Synthetic electrical panel job',
    ...(options.crewId?{crewId:'roster_01'}:{}),fieldUpdates:options.fieldUpdates||[]},
  auditIssuer:'',auditSubject:'',writes:0,reads:0,assignmentChecks:0
 };
 const db={prepare(sql){return {bind(...args){return {async first(){
  if(sql.startsWith('SELECT role FROM business_memberships')){
   return state.active&&args[0]===businessId&&args[1]===issuer&&args[2]===subject&&args[3]==='active'?{role:state.role}:null;
  }
  if(sql.startsWith('SELECT payload, revision, updated_at, deleted_at FROM tenant_records')||
     sql.startsWith('SELECT payload, revision, updated_at, deleted_at, updated_by_issuer')){
   const type=args[1];state.reads++;
   if(type==='crew')return options.missingCrew?null:{revision:1,payload:'{"id":"roster_01","name":"Display only"}',deleted_at:null};
   assert.equal(type,'jobs');assert.match(sql,/EXISTS \(SELECT 1 FROM business_memberships m/);
   if(options.readFailureAfterWrite&&state.writes)throw Error('Readback interrupted');
   if(options.readMissingAfterWrite&&state.writes)return null;
   if(!state.active)return null;
   const latest=structuredClone(state.job);
   if(options.changedReadback&&state.writes)latest.fieldUpdates[latest.fieldUpdates.length-1].note='Altered unverified payload';
   return {revision:state.revision,payload:JSON.stringify(latest),
    deleted_at:options.deleted?'2026-11-03':null,
    updated_by_issuer:state.auditIssuer,updated_by_subject:state.auditSubject};
  }
  if(sql.startsWith('INSERT INTO tenant_records')){
   assert.match(sql,/ON CONFLICT\(business_id,record_type,id\)/);
   assert.match(sql,/tenant_records\.revision=\?/);
   assert.match(sql,/business_memberships/);
   assert.match(sql,/COALESCE\(json_extract\(\?, '\$\.crewId'\)/);
   assert.deepEqual(args.slice(0,3),[businessId,'jobs',jobId]);
   assert.equal(args[5],issuer);assert.equal(args[6],subject);
   const expected=args.at(-1);
   if(!state.active||state.role!=='member'||expected!==state.revision||options.rejectCAS)return null;
   if(options.onBeforeCommit)await options.onBeforeCommit(state);
   if(!state.active||expected!==state.revision)return null;
   const next=JSON.parse(args[4]);
   state.job=next;state.revision++;state.writes++;
   state.auditIssuer=issuer;state.auditSubject=subject;
   if(options.onAfterWrite)await options.onAfterWrite(state);
   return {revision:state.revision,updated_at:'2026-11-03 08:00:01'};
  }
  throw Error('Unexpected synthetic SQL '+sql.slice(0,110));
 }}}}}};
 const verifyAssignment=async({authorization,jobId:target,revision})=>{
  state.assignmentChecks++;
  if(options.assignmentMissing||options.assignmentRevokedAt===state.assignmentChecks)return false;
  return {verified:true,source:'server_verified_job_assignment',
   issuer:authorization.issuer,subject:authorization.subject,businessId:authorization.businessId,
   jobId:target,jobRevision:revision,...options.proofOverrides};
 };
 const request=()=>({db,principal:{verified:true,issuer,subject},businessId,jobId,event:evt(),verifyAssignment});
 return {state,db,request,verifyAssignment};
}
test('synthetic signed crew member writes exactly one job blocker by existing CAS and verifies attributed server readback',async()=>{
 const f=fixture();const before=structuredClone(f.state.job);
 const result=await submitAssignedCrewBlocker(f.request());
 assert.equal(result.status,'readback_verified');assert.equal(result.writeAttributionVerified,true);
 assert.equal(result.assignmentCheckedBeforeWrite,true);assert.equal(result.assignmentAtCommitVerified,false);
 assert.equal(result.readbackVerified,true);assert.equal(result.acknowledged,false);
 assert.equal(result.actionReceiptRef,null);assert.equal(result.executionAuthority,false);
 assert.equal(result.observedServerRevision,4);
 assert.equal(f.state.writes,1);assert.equal(f.state.assignmentChecks,2);
 assert.deepEqual(f.state.job.fieldUpdates[0],{
  schemaVersion:1,eventId:'event_01',idempotencyKey:'crew_report_01',
  kind:'job_blocker_reported',note:'Two required materials are missing',
  eventAt:'2026-11-03T08:00:00Z',actorId:subject,actorIssuer:issuer
 });
 assert.equal(f.state.job.title,before.title,'The existing job remains the data authority');
 assert.ok(Object.isFrozen(result));
});
test('a duplicate report cannot write again or falsely claim an acknowledged exchange',async()=>{
 const f=fixture(),one=await submitAssignedCrewBlocker(f.request());
 const replay=await submitAssignedCrewBlocker(f.request());
 assert.equal(one.status,'readback_verified');assert.equal(replay.status,'duplicate_unverified');
 assert.equal(replay.readbackVerified,false);assert.equal(f.state.writes,1);
 const collided={...evt(),eventId:'other_event'};
 const collision=await submitAssignedCrewBlocker({...f.request(),event:collided});
 assert.equal(collision.status,'duplicate_unverified');assert.equal(f.state.writes,1);
});
test('missing or fabricated server-owned job assignment service always fails before a business write',async()=>{
 const f=fixture();
 await assert.rejects(submitAssignedCrewBlocker({...f.request(),verifyAssignment:undefined}),{status:403});
 await assert.rejects(submitAssignedCrewBlocker({...f.request(),verifyAssignment:async()=>true}),{status:403});
 await assert.rejects(submitAssignedCrewBlocker({...f.request(),verifyAssignment:async()=>({...await f.verifyAssignment({authorization:{issuer,subject,businessId},jobId,revision:3}),subject:'forged'})}),{status:403});
 assert.equal(f.state.writes,0);
});
test('signed actor identity must match the local event, and no supplied role is a membership grant',async()=>{
 const f=fixture();
 await assert.rejects(submitAssignedCrewBlocker({...f.request(),principal:{verified:true,issuer,subject:'person_02'}}),{status:403});
 await assert.rejects(submitAssignedCrewBlocker({...f.request(),principal:{verified:false,issuer,subject}}),{status:401});
 const x=fixture({role:'viewer'});
 await assert.rejects(submitAssignedCrewBlocker(x.request()),{status:403});
 const owner=fixture({role:'owner'});
 await assert.rejects(submitAssignedCrewBlocker(owner.request()),{status:403});
 assert.equal(f.state.writes+x.state.writes+owner.state.writes,0);
});
test('revoked company role, stale/deleted source, cross-tenant job and invalid queue success fail closed',async()=>{
 const revoked=fixture({active:false});
 await assert.rejects(submitAssignedCrewBlocker(revoked.request()),{status:403});
 const stale=fixture({revision:4});
 await assert.rejects(submitAssignedCrewBlocker(stale.request()),{status:409});
 const deleted=fixture({deleted:true});
 await assert.rejects(submitAssignedCrewBlocker(deleted.request()),{status:404});
 const foreign=fixture({foreignJob:true});
 await assert.rejects(submitAssignedCrewBlocker(foreign.request()),/identity conflicts/);
 const fake=fixture();
 await assert.rejects(submitAssignedCrewBlocker({...fake.request(),event:{...evt(),deliveryState:'readback_verified'}}),{status:400});
 assert.equal(revoked.state.writes+stale.state.writes+deleted.state.writes+foreign.state.writes+fake.state.writes,0);
});
test('assignment revocation between independent checks prevents record writer invocation',async()=>{
 const f=fixture({assignmentRevokedAt:2});
 await assert.rejects(submitAssignedCrewBlocker(f.request()),{status:403});
 assert.equal(f.state.assignmentChecks,2);assert.equal(f.state.writes,0);
});
test('revocation at D1 CAS remains a conflict and does not claim server delivery',async()=>{
 const f=fixture({onBeforeCommit:s=>{s.active=false}});
 await assert.rejects(submitAssignedCrewBlocker(f.request()),{status:409});
 assert.equal(f.state.writes,0);
});
test('lost readback after successful CAS remains committed but unverified, without retry',async()=>{
 const fail=fixture({readFailureAfterWrite:true});
 const result=await submitAssignedCrewBlocker(fail.request());
 assert.equal(result.status,'server_committed_unverified');
 assert.equal(result.readbackVerified,false);
 assert.equal(result.writeAttributionVerified,false);
 assert.equal(fail.state.writes,1);
 const revoked=fixture({onAfterWrite:s=>{s.active=false}});
 const returned=await submitAssignedCrewBlocker(revoked.request());
 assert.equal(returned.status,'server_committed_unverified');
 assert.equal(revoked.state.writes,1);
 const altered=fixture({changedReadback:true});
 assert.equal((await submitAssignedCrewBlocker(altered.request())).status,'server_committed_unverified');
 assert.equal(altered.state.writes,1);
});
test('bounded field histories and missing crew link deny untrusted or inconsistent writes',async()=>{
 const oversized=fixture({fieldUpdates:Array.from({length:41},(_,i)=>({eventId:'history_'+i}))});
 await assert.rejects(submitAssignedCrewBlocker(oversized.request()),{status:409});
 const unlinked=fixture({crewId:true,missingCrew:true});
 await assert.rejects(submitAssignedCrewBlocker(unlinked.request()),{status:400});
 assert.equal(oversized.state.writes+unlinked.state.writes,0);
});
test('a same-revision idempotency key collision is never treated as a successful write',async()=>{
 const f=fixture({fieldUpdates:[{eventId:'previous_event',idempotencyKey:'crew_report_01',actorId:'someone_else'}]});
 const result=await submitAssignedCrewBlocker(f.request());
 assert.equal(result.status,'duplicate_unverified');assert.equal(result.readbackVerified,false);
 assert.equal(f.state.writes,0);
});
