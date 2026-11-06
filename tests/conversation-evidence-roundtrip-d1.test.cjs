'use strict';
/* TF-MI-CONV-01C: synthetic actual-D1-to-existing-IDB transcript integration.
 * No HTTP route, real identities/devices, production schema, push or effects.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const store=require('../public/conversation-store.js');
const commands=require('../public/command-registry.js');
const {createDB}=require('./helpers/local-db.cjs');
const businessId='business_123',jobId='job_01',issuer='synthetic-issuer';
const principal=subject=>({verified:true,issuer,subject});
function statements(source){
 const clean=source.replace(/^\s*--[^\n]*$/gm,'');
 const triggers=[];
 const sourceWithMarkers=clean.replace(/CREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/gi,sql=>{
  const marker='__TF_THREAD_TRIGGER_'+triggers.length+'__';
  triggers.push(sql.slice(0,-1).trim());
  return marker+';';
 });
 return sourceWithMarkers.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
  const match=/^__TF_THREAD_TRIGGER_(\d+)__$/.exec(x);
  return match?triggers[Number(match[1])]:x;
 });
}
function indexedConversationDB(){
 const db=createDB({},['aiConversationThreads','aiConversationTurns']);
 const original=db.transaction.bind(db);
 db.transaction=(names,mode)=>{
  const tx=original(names,mode),get=tx.objectStore.bind(tx);
  tx.objectStore=name=>{
   const s=get(name);
   return {...s,add:value=>s.put(value),index:label=>{
    const property=label==='byScope'?'scopeKey':
     label==='byThread'?'threadId':null;
    if(!property)throw Error('Unsupported test index');
    return {getAll:key=>{
     const read=s.getAll(),result={};
     read.onsuccess=()=>{result.result=read.result.filter(v=>v[property]===key);
      result.onsuccess?.()};
     read.onerror=()=>result.onerror?.();
     return result;
    }};
   }};
  };
  return tx;
 };
 return db;
}
test('real disposable D1 crew report -> office authenticated reply -> existing local thread copy',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tf-conversation-evidence-'));
 let dispose;
 try{
  const config=path.join(tmp,'wrangler.json');
  fs.writeFileSync(config,JSON.stringify({
   name:'tf-conversation-evidence-test',main:path.join(root,'src/index.js'),
   compatibility_date:'2026-10-13',
   d1_databases:[{binding:'TF_DB',database_name:'tf-conversation-evidence',
    database_id:'00000000-0000-4000-8000-000000000097'}]
  }));
  const {getPlatformProxy}=await import('wrangler');
  const proxy=await getPlatformProxy({configPath:config,
   persist:{path:path.join(tmp,'state')}});
  dispose=proxy.dispose;
  const db=proxy.env.TF_DB;
  const execute=(sql,args=[])=>db.prepare(sql).bind(...args).run();
  for(const name of [
   '0001_tenant_foundation.sql','0002_record_audit.sql',
   '0003_extended_business_records.sql','0004_job_access_grants.sql'
  ]){
   const source=fs.readFileSync(path.join(root,'migrations',name),'utf8');
   for(const sql of statements(source))await execute(sql);
  }
  await execute('INSERT INTO businesses(id,name) VALUES (?,?)',
   [businessId,'Synthetic electrical contractor']);
  for(const [subject,role] of [['owner_01','owner'],['crew_01','member'],
    ['office_01','member']])
   await execute('INSERT INTO business_memberships(business_id,issuer,subject,role) VALUES (?,?,?,?)',
    [businessId,issuer,subject,role]);
  await execute('INSERT INTO tenant_records(business_id,record_type,id,payload) VALUES (?,?,?,?)',
   [businessId,'jobs',jobId,JSON.stringify({id:jobId,businessId,
    title:'Synthetic panel replacement',fieldUpdates:[]})]);
  for(const [subject,scope] of [['crew_01','crew'],['office_01','office']])
   await execute(
    'INSERT INTO job_access_grants(business_id,job_id,issuer,subject,scope,granted_by_issuer,granted_by_subject) VALUES (?,?,?,?,?,?,?)',
    [businessId,jobId,issuer,subject,scope,issuer,'owner_01']);
  const {createLocalCrewReport,submitGrantedCrewBlocker}=
   await import('../src/role-exchange.js');
  const {answerOfficeBlockerQuestion}=
   await import('../src/office-blocker-conversation.js');
  const {verifiedAccountConversationScope,createOfficeConversationEvidenceBridge}=
   await import('../public/conversation-evidence-bridge.js');
  const e=createLocalCrewReport({businessId,actorId:'crew_01',
   jobId,baseRevision:1,note:'The required panel parts have not arrived.',
   eventId:'blocker_01',idempotencyKey:'blocker_op_01',
   at:'2026-11-06T11:00:00.000Z'});
  const write=await submitGrantedCrewBlocker({
   db,principal:principal('crew_01'),businessId,jobId,event:e
  });
  assert.equal(write.status,'readback_verified');
  const row=()=>db.prepare('SELECT revision FROM tenant_records WHERE business_id=? AND record_type=? AND id=?')
   .bind(businessId,'jobs',jobId).first();
  assert.equal((await row()).revision,2);

  const local=indexedConversationDB();
  const identity={issuer,subject:'office_01'};
  const scope=await verifiedAccountConversationScope({...identity,businessId});
  const thread=await store.createThread(local,scope,'Crew blocker on job');
  const question='What is blocking this job?';
  await store.appendTurn(local,scope,thread.id,{
   role:'user',status:'committed',source:'user',content:question
  });
  const host={businessId,actorId:scope.actorId,screen:'ai',
   contextRecordId:jobId,threadId:thread.id};
  const bridge=createOfficeConversationEvidenceBridge({
   db:local,store,definitions:commands.definitions,
   session:async()=>({status:'signed_in',identity,
    businesses:[{business_id:businessId,role:'member'}]}),
   readHost:()=>({...host}),
   fetchOfficeReply:async input=>answerOfficeBlockerQuestion({
    db,principal:principal('office_01'),...input
   })
  });
  const input={businessId,jobId,eventId:e.eventId,threadId:thread.id,
   question,expectedJobRevision:2};
  const result=await bridge.attach(input);
  assert.equal(result.status,'saved_device_local_copy');
  assert.equal(result.sourceRevision,2);
  assert.equal(result.proposal.commandId,'draft.prepare');
  assert.equal(result.proposal.status,'review_only_not_prepared');
  assert.equal(result.commandExecuted,false);
  assert.equal(result.executionAuthority,false);
  assert.equal(result.remoteThreadBindingVerified,false);
  assert.equal(result.clientCopyIsAuthorizationProof,false);
  assert.equal((await row()).revision,2,'reading/saving transcript does not mutate cloud job');
  assert.equal(local.dump().jobs.length,0,'source is not copied as a business record');
  assert.equal(local.dump().commandLog.length,0,'no second queue or command');
  const turns=await store.listTurns(local,scope,thread.id);
  assert.deepEqual(turns.map(t=>t.role),['user','assistant']);
  assert.equal(turns[1].source,'authenticated_cloud_evidence');
  assert.deepEqual(turns[1].refs,['jobs:job_01@2']);
  assert.match(turns[1].content,/required panel parts/);
  assert.equal((await store.listThreads(local,scope))[0].syncState,'local_only');

  // Revoke the exact office grant, then submit a fresh question in the
  // same thread. No second reply is saved after a denied server read.
  await execute(
   "UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND issuer=? AND subject=? AND scope='office'",
   [businessId,jobId,issuer,'office_01']);
  const followup='What should we do next?';
  await store.appendTurn(local,scope,thread.id,{
   role:'user',status:'committed',source:'user',content:followup
  });
  await assert.rejects(bridge.attach({...input,question:followup}),{status:403});
  const deniedTurns=await store.listTurns(local,scope,thread.id);
  assert.deepEqual(deniedTurns.map(t=>t.role),['user','assistant','user']);
  assert.equal((await row()).revision,2);
 }finally{
  if(dispose)await dispose();
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
