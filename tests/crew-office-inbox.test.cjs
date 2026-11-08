'use strict';
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let readOfficeCrewBlocker,OFFICE_BLOCKER_READ_SQL;
before(async()=>({readOfficeCrewBlocker,OFFICE_BLOCKER_READ_SQL}=
 await import('../src/crew-office-inbox.js')));

const businessId='business_123',jobId='job_01';
const issuer='https://id.example',subject='office_01';
const report=()=>({schemaVersion:1,eventId:'event_01',idempotencyKey:'operation_01',
 kind:'job_blocker_reported',actorId:'crew_01',actorIssuer:issuer,
 note:'Two required materials are missing',eventAt:'2026-11-03T08:00:00Z'});

function fixture({role='member',active=true,grant=true,jobRevision=4,
 deleted=false,foreign=false,updates=[report()],badSQL=false}={}){
 const state={role,active,grant,jobRevision,deleted,foreign,updates,readCount:0,writes:0};
 const db={prepare(sql){
  if(/\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql))throw Error('Unexpected mutation');
  return {bind(...args){return {async first(){
   if(sql.startsWith('SELECT role FROM business_memberships')){
    assert.deepEqual(args,[businessId,issuer,subject,'active']);
    return state.active?{role:state.role}:null;
   }
   assert.match(sql,/job_access_grants/);
   assert.match(sql,/g\.scope='office'/);
   assert.match(sql,/g\.status='active'/);
   assert.match(sql,/m\.status='active'/);
   assert.match(sql,/t\.deleted_at IS NULL/);
   assert.deepEqual(args,[issuer,subject,businessId,jobId]);
   state.readCount++;
   if(badSQL)throw Error('No grant schema');
   if(!state.active||state.deleted||
      (state.role==='member'&&!state.grant))return null;
   return {revision:state.jobRevision,deleted_at:null,
    payload:JSON.stringify({id:jobId,businessId:state.foreign?'business_other':businessId,
     fieldUpdates:state.updates})};
  }}}};
 }};
 const request=(changes={})=>({db,principal:{verified:true,issuer,subject},
  businessId,jobId,eventId:'event_01',...changes});
 return {db,state,request};
}

test('office read is scoped by membership and job grant in the same SQL statement',async()=>{
 assert.match(OFFICE_BLOCKER_READ_SQL,/job_access_grants/);
 assert.match(OFFICE_BLOCKER_READ_SQL,/g\.scope='office'/);
 const f=fixture();
 const result=await readOfficeCrewBlocker(f.request());
 assert.equal(result.deliveryState,'server_readback_observed');
 assert.equal(result.sourceVerified,true);
 assert.equal(result.note,report().note);
 assert.equal(result.observedJobRevision,4);
 assert.equal(result.correlationId,report().eventId);
 assert.equal(result.operationId,report().idempotencyKey);
 assert.deepEqual(result.viewer,{issuer,subject});
 assert.deepEqual(result.reportedBy,{issuer,subject:'crew_01'});
 assert.equal(result.actorAttributionVerified,false);
 assert.equal(result.officeAcknowledged,false);
 assert.equal(result.crewAcknowledged,false);
 assert.equal(result.executionAuthority,false);
 assert.equal(result.actionReceiptRef,null);
 assert.equal(f.state.readCount,1);
 assert.ok(Object.isFrozen(result));
});

test('office member cannot see an unassigned job, owner and admin retain company-level access',async()=>{
 const unassigned=fixture({grant:false});
 await assert.rejects(readOfficeCrewBlocker(unassigned.request()),{status:403});
 for(const role of ['owner','admin']){
  const f=fixture({role,grant:false});
  assert.equal((await readOfficeCrewBlocker(f.request())).sourceVerified,true);
 }
});

test('revoked membership, viewer, missing grant schema and mismatched principal fail closed',async()=>{
 const revoked=fixture({active:false});
 await assert.rejects(readOfficeCrewBlocker(revoked.request()),{status:403});
 const viewer=fixture({role:'viewer'});
 await assert.rejects(readOfficeCrewBlocker(viewer.request()),{status:403});
 const missing=fixture({badSQL:true});
 await assert.rejects(readOfficeCrewBlocker(missing.request()),{status:503});
 const identity=fixture();
 await assert.rejects(readOfficeCrewBlocker(identity.request({
  principal:{verified:false,issuer,subject}
 })),{status:401});
});

test('foreign or deleted job, malformed revision, duplicate and missing event are rejected',async()=>{
 for(const options of [
  {foreign:true},{deleted:true},{jobRevision:0},
  {updates:[]},{updates:[report(),report()]},
  {updates:[report(),{...report(),eventId:'event_02'}]}
 ]){
  const f=fixture(options);
  await assert.rejects(readOfficeCrewBlocker(f.request()));
 }
});

test('tampered crew report payload never becomes an office delivery success',async()=>{
 for(const bad of [
  {...report(),kind:'invoice_paid'}, {...report(),actorId:'../../admin'},
  {...report(),note:'  '},{...report(),eventAt:'not a timestamp'},
  {...report(),idempotencyKey:null},{...report(),actorIssuer:''}
 ]){
  const f=fixture({updates:[bad]});
  await assert.rejects(readOfficeCrewBlocker(f.request()),{status:409});
 }
});

test('read-only office inbox never creates a task, receipt or message',async()=>{
 const f=fixture();
 const view=await readOfficeCrewBlocker(f.request());
 assert.equal(view.actionReceiptRef,null);
 assert.equal(view.officeAcknowledged,false);
 assert.equal(f.state.writes,0);
 await assert.rejects(readOfficeCrewBlocker(f.request({eventId:'../../other'})),{status:400});
 await assert.rejects(readOfficeCrewBlocker(f.request({businessId:'other_business'})));
});
