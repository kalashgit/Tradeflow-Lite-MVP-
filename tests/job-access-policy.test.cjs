const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('R01-02 disposable D1 job grants are tenant/job/actor scoped and revocable',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tf-job-grants-'));
 let dispose;
 try{
  const root=path.resolve(__dirname,'..');
  const config=path.join(tmp,'wrangler.json');
  fs.writeFileSync(config,JSON.stringify({
   name:'tf-job-grants-disposable',main:path.join(root,'src/index.js'),
   compatibility_date:'2026-10-13',
   d1_databases:[{binding:'TF_DB',database_name:'tf-job-grants-disposable',
    database_id:'00000000-0000-4000-8000-000000000097'}]
  }));
  const {getPlatformProxy}=await import('wrangler');
  const proxy=await getPlatformProxy({configPath:config,persist:{path:path.join(tmp,'state')}});
  dispose=proxy.dispose;
  const db=proxy.env.TF_DB;
  const run=(sql,params=[])=>db.prepare(sql).bind(...params).run();
  for(const file of ['0001_tenant_foundation.sql','0004_job_access_grants.sql']){
   const sql=fs.readFileSync(path.join(root,'migrations',file),'utf8')
    .replace(/^\s*--[^\n]*$/gm,'');
   for(const part of sql.split(';').map(x=>x.trim()).filter(Boolean))await run(part);
  }
  for(const id of ['business_001','business_002'])
   await run('INSERT INTO businesses(id,name) VALUES(?,?)',[id,id]);
  for(const [business,subject,role] of [
   ['business_001','owner_01','owner'],
   ['business_001','crew_01','member'],
   ['business_001','office_01','member'],
   ['business_001','viewer_01','viewer'],
   ['business_002','crew_01','member']
  ])await run('INSERT INTO business_memberships(business_id,issuer,subject,role) VALUES(?,?,?,?)',
   [business,'test-issuer',subject,role]);
  for(const [business,id] of [['business_001','job_01'],['business_001','job_02'],['business_002','job_01']])
   await run('INSERT INTO tenant_records(business_id,record_type,id,payload) VALUES(?,?,?,?)',
    [business,'jobs',id,JSON.stringify({id,businessId:business})]);
  const grant=(business,job,subject,scope)=>
   run('INSERT INTO job_access_grants(business_id,job_id,issuer,subject,scope,granted_by_issuer,granted_by_subject) VALUES(?,?,?,?,?,?,?)',
    [business,job,'test-issuer',subject,scope,'test-issuer','owner_01']);
  await grant('business_001','job_01','crew_01','crew');
  await grant('business_001','job_01','office_01','office');
  const {readJobAccess}=await import('../src/job-access.js');
  const principal=subject=>({verified:true,issuer:'test-issuer',subject});
  const read=(subject,job='job_01',scope='crew',business='business_001')=>
   readJobAccess({db,principal:principal(subject),businessId:business,jobId:job,scope});
  const crew=await read('crew_01');
  assert.equal(crew.accessClass,'assigned_job');
  assert.equal(crew.grantRevision,1);
  assert.equal(crew.writeAuthorized,false);
  assert.equal(crew.jobRevision,1);
  assert.equal((await read('owner_01','job_02')).accessClass,'company_member');
  assert.equal((await read('office_01','job_01','office')).scope,'office');
  await assert.rejects(read('office_01','job_01','crew'),/Assigned job/);
  await assert.rejects(read('crew_01','job_02'),/Assigned job/);
  await assert.rejects(read('viewer_01'),/Assigned job/);
  await assert.rejects(read('crew_01','job_01','crew','business_002'),/Assigned job/);
  await assert.rejects(grant('business_001','job_02','crew_01','crew').then(()=>grant('business_001','job_02','crew_01','crew')));
  await run("UPDATE job_access_grants SET status='revoked',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=?",
   ['business_001','job_01','crew_01']);
  await assert.rejects(read('crew_01'),/Assigned job/);
  await run("UPDATE job_access_grants SET status='active',grant_revision=grant_revision+1 WHERE business_id=? AND job_id=? AND subject=?",
   ['business_001','job_01','crew_01']);
  assert.equal((await read('crew_01')).grantRevision,3);
  await run("UPDATE business_memberships SET role='viewer' WHERE business_id=? AND subject=?",
   ['business_001','crew_01']);
  await assert.rejects(read('crew_01'),/Assigned job/);
  await run("UPDATE business_memberships SET role='member' WHERE business_id=? AND subject=?",
   ['business_001','crew_01']);
  await run("UPDATE tenant_records SET deleted_at=datetime('now') WHERE business_id=? AND id=? AND record_type='jobs'",
   ['business_001','job_01']);
  await assert.rejects(read('crew_01'),/Assigned job/);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM job_access_grants').first()).n,3);
 }finally{
  if(dispose)await dispose();
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
