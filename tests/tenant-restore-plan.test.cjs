'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const auth={businessId:'business_001',role:'owner',issuer:'test-issuer',subject:'user_123'};
const record=(id,name)=>({businessId:'business_001',type:'jobs',id,revision:2,record:{name}});
test('dry run reports new, unchanged and conflict without any write',async()=>{
 const {createSnapshot}=await import('../src/backup-snapshot.js');
 const {planTenantRestore}=await import('../src/tenant-restore-plan.js');
 const snap=await createSnapshot('business_001',[record('new_1','New'),record('same_1','Same'),record('other_1','Old')]);
 const seen=[];
 const db={prepare(sql){assert.match(sql,/SELECT revision,deleted_at,payload/);return {bind(...p){seen.push(p);return {first:async()=>p[2]==='new_1'?null:{revision:3,deleted_at:null,payload:JSON.stringify({name:p[2]==='same_1'?'Same':'Updated'})}}}}}};
 const plan=await planTenantRestore(db,auth,snap);
 assert.equal(plan.dryRun,true);assert.deepEqual([plan.createCandidates,plan.alreadyPresent,plan.manualReview],[1,1,1]);
 assert.equal(seen.length,3);assert.ok(seen.every(x=>x[0]==='business_001'));
});
test('mismatched business or nonowner rejected before querying',async()=>{
 const {createSnapshot}=await import('../src/backup-snapshot.js');
 const {planTenantRestore}=await import('../src/tenant-restore-plan.js');
 const snap=await createSnapshot('business_001',[]);
 const noWrites={prepare(){throw Error('should not reach database')}};
 await assert.rejects(planTenantRestore(noWrites,{...auth,role:'viewer'},snap),{status:403});
 await assert.rejects(planTenantRestore(noWrites,{...auth,businessId:'business_002'},snap),{status:400});
});
test('deleted remote record requires review and altered snapshot fails checksum',async()=>{
 const {createSnapshot}=await import('../src/backup-snapshot.js');
 const {planTenantRestore}=await import('../src/tenant-restore-plan.js');
 const snap=await createSnapshot('business_001',[record('job_01','A')]);
 const db={prepare:()=>({bind:()=>({first:async()=>({revision:4,deleted_at:'2026-10-28',payload:'{}'})})})};
 assert.equal((await planTenantRestore(db,auth,snap)).manualReview,1);
 snap.records[0].record.name='Tampered';
 await assert.rejects(planTenantRestore(db,auth,snap),{status:400});
});
