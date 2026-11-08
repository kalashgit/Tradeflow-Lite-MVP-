const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../src/recovery-evidence.js');
function fixture(){
 return {
  kind:'tradeflow.recovery.evidence.v1',
  source:{environment:'staging',databaseAlias:'isolated_backup_db',schemaHash:'a'.repeat(64),tenantCount:2},
  artifact:{backupId:'backup_001',createdAt:'2026-10-31T08:00:00Z',digestSha256:'b'.repeat(64),bytes:4096,
   storageRef:'opaque_reference_001',encryptionAlgorithm:'AES-256-GCM',keyAlias:'approved_key_alias'},
  retention:{policyId:'policy_001',deleteAfter:'2026-11-30T08:00:00Z'},
  integrity:{receiptId:'integrity_001',verifiedAt:'2026-10-31T08:15:00Z',
   tenantIsolationReceipt:'tenant_integrity_001',foreignKeyReceipt:'fk_check_001'},
  drill:{receiptId:'restore_001',completedAt:'2026-10-31T08:30:00Z',environment:'disposable',
   restoreDurationMs:2500,digestMatched:true,rowsMatched:true,tenantIsolationPassed:true,foreignKeysPassed:true}
 };
}
test('complete evidence is eligible for independent review but never production approval',async()=>{
 const {assessRecoveryEvidence}=await load();
 const r=assessRecoveryEvidence(fixture());
 assert.equal(r.evidenceReadyForIndependentReview,true);
 assert.equal(r.independentlyVerified,false);
 assert.equal(r.productionMigrationAuthorized,false);
 assert.equal(r.productionRestoreAuthorized,false);
 assert.equal(r.requiresHumanApproval,true);
 assert.equal(Object.isFrozen(r),true);
});
test('failed drill attestation blocks evidence review without claiming approval',async()=>{
 const {assessRecoveryEvidence}=await load();const m=fixture();
 m.drill.tenantIsolationPassed=false;
 const r=assessRecoveryEvidence(m);
 assert.equal(r.evidenceReadyForIndependentReview,false);
 assert.deepEqual(r.failedChecks,['tenantIsolationPassed']);
 assert.equal(r.productionRestoreAuthorized,false);
});
test('unknown fields and credential-like material fail closed',async()=>{
 const {assessRecoveryEvidence}=await load();
 for(const mutate of [
  m=>m.apiToken='private',
  m=>m.artifact.secret='opaque',
  m=>m.source.tenantIds=['company_secret'],
  m=>m.artifact.storageRef='https://storage.example/backup',
  m=>m.artifact.keyAlias='key/secret',
  m=>m.drill.authorization='auto_approve'
 ]){
  const m=fixture();mutate(m);
  assert.throws(()=>assessRecoveryEvidence(m));
 }
});
test('missing fields, invalid hashes and unsafe size metadata are rejected',async()=>{
 const {assessRecoveryEvidence}=await load();
 for(const mutate of [
  m=>delete m.integrity.foreignKeyReceipt,
  m=>m.source.schemaHash='bad',
  m=>m.artifact.bytes=0,
  m=>m.artifact.bytes=Number.MAX_SAFE_INTEGER+1,
  m=>m.source.tenantCount=-2,
  m=>m.artifact.encryptionAlgorithm='none',
  m=>m.drill.restoreDurationMs=0,
  m=>m.drill.digestMatched='yes'
 ]){
  const m=fixture();mutate(m);assert.throws(()=>assessRecoveryEvidence(m));
 }
});
test('invalid or backwards UTC timestamps fail closed',async()=>{
 const {assessRecoveryEvidence}=await load();
 for(const mutate of [
  m=>m.artifact.createdAt='2026-02-30T08:00:00Z',
  m=>m.artifact.createdAt='2026-10-31T08:00:00+01:00',
  m=>m.retention.deleteAfter='2026-10-30T08:00:00Z',
  m=>m.integrity.verifiedAt='2026-10-31T07:00:00Z',
  m=>m.drill.completedAt='2026-10-31T08:10:00Z'
 ]){
  const m=fixture();mutate(m);assert.throws(()=>assessRecoveryEvidence(m));
 }
});
test('reject oversized or cyclic manifest without network, storage or execution',async()=>{
 const {assessRecoveryEvidence}=await load();
 const x=fixture();x.source.databaseAlias='a'.repeat(9000);
 assert.throws(()=>assessRecoveryEvidence(x),e=>e.code==='manifest_too_large');
 const cyclic=fixture();cyclic.source.loop=cyclic;
 assert.throws(()=>assessRecoveryEvidence(cyclic),/serialization/);
});
