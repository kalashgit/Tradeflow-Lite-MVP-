'use strict';
/* TF-RM-03-G04: real disposable Wrangler D1 test of the existing internal
 * field -> office -> field contract. No live services, routes, models or customers.
 * Tests the actual SQL CAS, grant revocation and readback, not mocked SQL.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const businessId='business_123',jobId='job_01',issuer='test-issuer';
const principal=subject=>({verified:true,issuer,subject});
function statements(source){
 const clean=source.replace(/^\s*--[^\n]*$/gm,'');
 const triggers=[];
 const text=clean.replace(/CREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/gi,sql=>{
  const tag='__TF_D1_TRIGGER_'+triggers.length+'__';
  triggers.push(sql.slice(0,-1).trim());
  return tag+';';
 });
 const parts=text.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
  const match=/^__TF_D1_TRIGGER_(\d+)__$/.exec(v);
  return match?triggers[Number(match[1])]:v;
 });
 assert.equal(triggers.length,(source.match(/CREATE\s+TRIGGER\b/gi)||[]).length);
 return parts;
}
test('disposable D1: assigned crew blocker -> authorized office response -> same crew acknowledgment',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tf-rm03-roundtrip-'));
 let dispose;
 try{
  const config=path.join(tmp,'wrangler.json');
  fs.writeFileSync(config,JSON.stringify({
   name:'tf-rm03-roundtrip-disposable',main:path.join(root,'src/index.js'),
   compatibility_date:'2026-10-13',
   d1_databases:[{binding:'TF_DB',database_name:'tf-rm03-roundtrip',
    database_id:'00000000-0000-4000-8000-000000000096'}]
  }));
  const {getPlatformProxy}=await import('wrangler');
  const proxy=await getPlatformProxy({configPath:config,persist:{path:path.join(tmp,'state')}});
  dispose=proxy.dispose;
  const db=proxy.env.TF_DB;
  const execute=(sql,params=[])=>db.prepare(sql).bind(...params).run();
  for(const filename of [
   '0001_tenant_foundation.sql','0002_record_audit.sql',
   '0003_extended_business_records.sql','0004_job_access_grants.sql'
  ]){
   const migration=fs.readFileSync(path.join(root,'migrations',filename),'utf8');
   for(const sql of statements(migration))await execute(sql);
  }
  for(const [id,name] of [[businessId,'Synthetic electrical company'],
   ['business_999','Foreign synthetic company']])
   await execute('INSERT INTO businesses(id,name) VALUES (?,?)',[id,name]);
  for(const [tenant,subject,role] of [
   [businessId,'owner_01','owner'],[businessId,'crew_01','member'],
   [businessId,'office_01','member'],[businessId,'crew_02','member'],
   [businessId,'viewer_01','viewer'],
   ['business_999','office_01','member']
  ])await execute(
   'INSERT INTO business_memberships(business_id,issuer,subject,role) VALUES (?,?,?,?)',
   [tenant,issuer,subject,role]);
  const job={id:jobId,businessId,title:'Synthetic commercial electrical service',
   status:'In progress',fieldUpdates:[]};
  await execute('INSERT INTO tenant_records(business_id,record_type,id,payload) VALUES (?,?,?,?)',
   [businessId,'jobs',jobId,JSON.stringify(job)]);
  await execute('INSERT INTO tenant_records(business_id,record_type,id,payload) VALUES (?,?,?,?)',
   [businessId,'jobs','job_02',JSON.stringify({...job,id:'job_02'})]);
  const grant=async(subject,scope)=>execute(
   'INSERT INTO job_access_grants(business_id,job_id,issuer,subject,scope,granted_by_issuer,granted_by_subject) VALUES (?,?,?,?,?,?,?)',
   [businessId,jobId,issuer,subject,scope,issuer,'owner_01']);
  await grant('crew_01','crew');
  await grant('crew_02','crew');
  await grant('office_01','office');
  const record=()=>db.prepare(
   'SELECT revision,payload,updated_by_issuer,updated_by_subject FROM tenant_records WHERE business_id=? AND record_type=? AND id=?'
  ).bind(businessId,'jobs',jobId).first();

  const {createLocalCrewReport,submitGrantedCrewBlocker}=await import('../src/role-exchange.js');
  const {readOfficeCrewBlocker}=await import('../src/crew-office-inbox.js');
  const {readAssignedCrewOfficeResponse}=await import('../src/crew-office-response.js');
  const {respondToCrewBlocker,acknowledgeOfficeBlockerResponse}=await import('../src/role-exchange-actions.js');
  const {reviewOfficeJobBlocker}=await import('../src/office-job-intelligence.js');
  const report=createLocalCrewReport({
   businessId,actorId:'crew_01',jobId,baseRevision:1,
   note:'Two required materials are missing',eventId:'blocker_01',
   idempotencyKey:'blocker_op_01',at:'2026-11-04T06:00:00Z'
  });
  const crew={db,principal:principal('crew_01'),businessId,jobId};
  const office={db,principal:principal('office_01'),businessId,jobId};

  const first=await submitGrantedCrewBlocker({...crew,event:report});
  assert.equal(first.status,'readback_verified');
  assert.equal(first.assignmentAtCommitVerified,true);
  assert.equal(first.acknowledged,false);
  assert.equal((await record()).revision,2);
  assert.equal((await record()).updated_by_subject,'crew_01');
  const officeRead=await readOfficeCrewBlocker({...office,eventId:report.eventId});
  assert.equal(officeRead.deliveryState,'server_readback_observed');
  assert.equal(officeRead.actorAttributionVerified,false);
  assert.equal(officeRead.officeAcknowledged,false);
  assert.equal(officeRead.observedJobRevision,2);
  const waiting=await readAssignedCrewOfficeResponse({...crew,
   reportEventId:report.eventId,expectedJobRevision:2});
  assert.equal(waiting.state,'awaiting_office_response');
  assert.equal(waiting.officeResponse.status,'not_recorded');
  assert.equal(waiting.externalDeliveryVerified,false);
  await assert.rejects(readAssignedCrewOfficeResponse({...crew,
   principal:principal('crew_02'),reportEventId:report.eventId}),{status:403},
   'another crew member with the same job grant cannot claim the reporter identity');

  // Reuse a real office grant rather than granting generic job access.
  const response=await respondToCrewBlocker({...office,
   eventId:'office_response_01',idempotencyKey:'office_response_op_01',
   expectedJobRevision:2,reportEventId:report.eventId,
   text:'Check supplier ETA and report back; no customer contact authorized.'
  });
  assert.equal(response.status,'readback_verified');
  assert.equal(response.readbackVerified,true);
  assert.equal(response.recordWriteReceipt?.status,'verified_internal_record_write');
  assert.equal(response.recordWriteReceipt.actor.subject,'office_01');
  assert.equal(response.acknowledged,false);
  assert.equal(response.externalEffects,false);
  assert.equal((await record()).revision,3);
  const returned=await readAssignedCrewOfficeResponse({...crew,
   reportEventId:report.eventId,expectedJobRevision:3});
  assert.equal(returned.state,'office_response_recorded');
  assert.equal(returned.officeResponse.eventId,'office_response_01');
  assert.match(returned.officeResponse.text,/supplier ETA/);
  assert.equal(returned.crewAcknowledgment.status,'not_recorded');
  assert.equal(returned.officeTaskReceipt,null);
  assert.equal(returned.commandExecuted,false);
  assert.equal(returned.executionAuthority,false);
  await assert.rejects(readAssignedCrewOfficeResponse({...crew,
   reportEventId:report.eventId,expectedJobRevision:2}),{status:409});

  const acknowledgment=await acknowledgeOfficeBlockerResponse({...crew,
   eventId:'crew_ack_01',idempotencyKey:'crew_ack_op_01',
   expectedJobRevision:3,reportEventId:report.eventId,
   responseEventId:'office_response_01'
  });
  assert.equal(acknowledgment.status,'readback_verified');
  assert.equal(acknowledgment.acknowledged,true);
  assert.equal(acknowledgment.transported,false);
  assert.equal(acknowledgment.notified,false);
  assert.equal(acknowledgment.externalEffects,false);
  assert.equal((await record()).revision,4);
  assert.equal((await record()).updated_by_subject,'crew_01');
  const observedAck=await readAssignedCrewOfficeResponse({...crew,
   reportEventId:report.eventId,expectedJobRevision:4});
  assert.equal(observedAck.state,'acknowledgment_recorded');
  assert.equal(observedAck.crewAcknowledgment.persistedEventPresent,true);
  assert.equal(observedAck.externalDeliveryVerified,false);
  assert.equal(observedAck.materialsResolved,false);

  const review=await reviewOfficeJobBlocker({
   ...office,eventId:report.eventId,expectedJobRevision:4
  });
  assert.equal(review.roleExchange.officeResponse.persistedEventPresent,true);
  assert.equal(review.roleExchange.crewAcknowledgment.persistedEventPresent,true);
  assert.equal(review.roleExchange.externallyDelivered,false);
  assert.equal(review.executionAuthority,false);
  assert.equal(review.suggestedNextAction,null);
  const saved=JSON.parse((await record()).payload);
  assert.equal(saved.fieldUpdates.length,3);
  assert.deepEqual(saved.fieldUpdates.map(x=>x.kind),[
   'job_blocker_reported','job_blocker_office_response',
   'job_blocker_response_acknowledged'
  ]);
  assert.equal((await db.prepare(
   "SELECT COUNT(*) AS n FROM tenant_records WHERE record_type='tasks'"
  ).first()).n,0,'a typed job-record response is not an approved task command');

  // Replays must not mutate the job or invent an independent delivery receipt.
  const sameReport=await submitGrantedCrewBlocker({...crew,event:report});
  assert.equal(sameReport.status,'duplicate_unverified');
  assert.equal((await record()).revision,4);
  const sameReply=await respondToCrewBlocker({...office,
   eventId:'office_response_01',idempotencyKey:'office_response_op_01',
   expectedJobRevision:4,reportEventId:report.eventId,text:'different'
  });
  assert.equal(sameReply.status,'duplicate_unverified');
  const sameAck=await acknowledgeOfficeBlockerResponse({...crew,
   eventId:'crew_ack_01',idempotencyKey:'crew_ack_op_01',
   expectedJobRevision:4,reportEventId:report.eventId,
   responseEventId:'office_response_01'
  });
  assert.equal(sameAck.status,'duplicate_unverified');
  assert.equal((await record()).revision,4);
  await assert.rejects(respondToCrewBlocker({...office,
   eventId:'office_response_02',idempotencyKey:'office_response_op_02',
   expectedJobRevision:2,reportEventId:report.eventId,text:'stale'
  }),{status:409});
  await assert.rejects(readOfficeCrewBlocker({...office,jobId:'job_02',eventId:report.eventId}),{status:403});
  await assert.rejects(readOfficeCrewBlocker({...office,businessId:'business_999',eventId:report.eventId}),{status:403});
  await assert.rejects(readOfficeCrewBlocker({...office,principal:principal('viewer_01'),eventId:report.eventId}),{status:403});
  assert.equal((await record()).revision,4);

  // Revocation denies fresh access; restoring it must increment the grant revision.
  await execute("UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=? AND scope='office'",
   [businessId,jobId,'office_01']);
  await assert.rejects(readOfficeCrewBlocker({...office,eventId:report.eventId}),{status:403});
  await assert.rejects(respondToCrewBlocker({...office,
   eventId:'office_response_03',idempotencyKey:'office_response_op_03',
   expectedJobRevision:4,reportEventId:report.eventId,text:'revoked'
  }),{status:403});
  await execute("UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=? AND scope='crew'",
   [businessId,jobId,'crew_01']);
  await assert.rejects(acknowledgeOfficeBlockerResponse({...crew,
   eventId:'crew_ack_02',idempotencyKey:'crew_ack_op_02',
   expectedJobRevision:4,reportEventId:report.eventId,
   responseEventId:'office_response_01'
  }),{status:403});
  await assert.rejects(readAssignedCrewOfficeResponse({...crew,
   reportEventId:report.eventId}),{status:403});
  assert.equal((await record()).revision,4);
 }finally{
  if(dispose)await dispose();
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
