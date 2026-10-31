'use strict';
// H04-10: authenticated, synthetic host acceptance with the committed SQLite
// migrations. No network, real identities, provider credentials, or business writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const {webcrypto}=require('node:crypto');

const issuer='https://synthetic-advisory.example',subject='synthetic_owner';
const businessId='business_001',jobId='job_01',audience='synthetic-advisory';
const oidcEnv={TF_OIDC_ISSUER:issuer,TF_OIDC_AUDIENCE:audience,
 TF_OIDC_JWKS_URL:issuer+'/keys'};
const advisoryEnv={TF_ADVISORY_ENABLED:'true',TF_ADVISORY_PROVIDER:'mock'};
const b64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');

function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tradeflow-advisory-sql-'));
 const database=path.join(dir,'synthetic.sqlite');
 function bridge(request){
  return JSON.parse(cp.execFileSync('python3',['tests/helpers/sqlite-tenant-host.py'],
   {input:JSON.stringify({database,...request}),encoding:'utf8'}));
 }
 bridge({initialize:true,issuer,subject});
 const sql=(query,params=[])=>bridge({sql:query,params});
 sql('INSERT INTO tenant_records (business_id,record_type,id,revision,payload) VALUES (?,?,?,?,?)',
  [businessId,'jobs',jobId,2,JSON.stringify({id:jobId,businessId,title:'Synthetic private job'})]);
 const db={prepare(query){return {bind(...params){return {
  first:async()=>sql(query,params)[0]||null,
  all:async()=>({results:sql(query,params)})
 }}}}};
 return {db,sql,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
async function verifiedIdentity(){
 const {verifyBearerToken}=await import('../src/oidc-verifier.js');
 const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',
  modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
  true,['sign','verify']);
 const jwk={...await webcrypto.subtle.exportKey('jwk',keys.publicKey),
  kid:'synthetic',alg:'RS256',use:'sig'};
 const now=Math.floor(Date.now()/1000);
 const unsigned=b64({alg:'RS256',typ:'JWT',kid:'synthetic'})+'.'+
  b64({iss:issuer,aud:audience,sub:subject,iat:now-5,exp:now+900});
 const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',
  keys.privateKey,new TextEncoder().encode(unsigned));
 const token=unsigned+'.'+Buffer.from(signature).toString('base64url');
 const fetchJwks=async()=>Response.json({keys:[jwk]});
 const request=value=>new Request('https://synthetic-advisory.example/test',
  {headers:{Authorization:'Bearer '+value}});
 const principal=await verifyBearerToken(request(token),oidcEnv,{fetchJwks});
 return {principal,verifyBearerToken,request,token,fetchJwks};
}
async function host(f,principal){
 const {readIntelligenceContext}=await import('../src/intelligence-context.js');
 const {requestAuthorizedServerAdvisory}=await import('../src/advisory-authorization.js');
 const context=await readIntelligenceContext({db:f.db,principal,businessId,jobId});
 return {context,request:(transport,ctx=context)=>requestAuthorizedServerAdvisory({
  db:f.db,principal,context:ctx,env:advisoryEnv,intent:'evidence_gaps',transport
 })};
}
const auditCount=f=>f.sql('SELECT COUNT(*) AS n FROM tenant_audit_events')[0].n;

test('signed JWT, real membership SQL and bounded job context permit mock-only advisory without writes',async()=>{
 const f=fixture();
 try{
  const {principal}=await verifiedIdentity(),h=await host(f,principal);
  let calls=0;const before=auditCount(f);
  const result=await h.request(async(payload)=>{
   calls++;
   assert.deepEqual(payload.evidence,[{type:'jobs',id:jobId,revision:2}]);
   assert.equal(JSON.stringify(payload).includes('Synthetic private job'),false);
   return {text:'Owner review needed'};
  });
  assert.equal(calls,1);
  assert.equal(result.readOnly,true);assert.equal(result.executionAuthority,false);
  assert.equal(auditCount(f),before);
  assert.equal(f.sql('SELECT revision FROM tenant_records WHERE id=?',[jobId])[0].revision,2);
 }finally{f.close();}
});

test('real SQLite membership revocation and role downgrade during mock inference deny result',async()=>{
 const {principal}=await verifiedIdentity();
 for(const statement of [
  "UPDATE business_memberships SET status='suspended' WHERE business_id=?",
  "UPDATE business_memberships SET role='viewer' WHERE business_id=?"
 ]){
  const f=fixture();
  try{
   const h=await host(f,principal),before=auditCount(f);let calls=0;
   await assert.rejects(h.request(async()=>{
    calls++;f.sql(statement,[businessId]);return {text:'Never disclose after revocation'};
   }),e=>e.code==='authorization_denied');
   assert.equal(calls,1);assert.equal(auditCount(f),before);
  }finally{f.close();}
 }
});

test('real SQL stale job revision and foreign business fail closed before transport',async()=>{
 const {principal}=await verifiedIdentity(),f=fixture();
 try{
  const h=await host(f,principal);let calls=0;
  f.sql('UPDATE tenant_records SET revision=3 WHERE business_id=? AND record_type=? AND id=?',
   [businessId,'jobs',jobId]);
  await assert.rejects(h.request(async()=>{calls++;return {text:'stale'}}),
   e=>e.code==='authorization_denied');
  assert.equal(calls,0);
  const {readIntelligenceContext}=await import('../src/intelligence-context.js');
  await assert.rejects(readIntelligenceContext({db:f.db,principal,
   businessId:'business_002',jobId}),e=>e.status===403);
  assert.equal(auditCount(f),0);
 }finally{f.close();}
});

test('tampered signed bearer cannot enter authenticated advisory host',async()=>{
 const {verifyBearerToken,request,token,fetchJwks}=await verifiedIdentity();
 const parts=token.split('.');parts[1]=b64({iss:issuer,aud:audience,sub:'attacker',
  iat:Math.floor(Date.now()/1000)-5,exp:Math.floor(Date.now()/1000)+900});
 await assert.rejects(verifyBearerToken(request(parts.join('.')),oidcEnv,{fetchJwks}),
  e=>e.status===401);
});

function addLinkedCost(f){
 f.sql('INSERT INTO tenant_records (business_id,record_type,id,revision,payload) VALUES (?,?,?,?,?)',
  [businessId,'jobCosts','cost_01',4,JSON.stringify({id:'cost_01',businessId,jobId,amount:120,currency:'USD'})]);
}

test('H04-11: a non-job cost revision changed during inference invalidates the advisory result',async()=>{
 const f=fixture();
 try{
  addLinkedCost(f);
  const {principal}=await verifiedIdentity(),h=await host(f,principal);
  assert.deepEqual(h.context.records.map(r=>r.type),['jobCosts','jobs']);
  const before=auditCount(f);let calls=0;
  await assert.rejects(h.request(async payload=>{
   calls++;
   assert.deepEqual(payload.evidence,[{type:'jobCosts',id:'cost_01',revision:4},{type:'jobs',id:jobId,revision:2}]);
   f.sql('UPDATE tenant_records SET revision=5 WHERE business_id=? AND record_type=? AND id=?',
    [businessId,'jobCosts','cost_01']);
   return {text:'Stale cost reasoning must be withheld'};
  }),e=>e.code==='authorization_denied');
  assert.equal(calls,1);assert.equal(auditCount(f),before);
  assert.equal(f.sql('SELECT revision FROM tenant_records WHERE record_type=? AND id=?',
   ['jobs',jobId])[0].revision,2);
 }finally{f.close();}
});

test('H04-11: missing, deleted, and foreign-identity linked evidence is denied before transport',async()=>{
 const {principal}=await verifiedIdentity();
 for(const mutate of [
  f=>f.sql('DELETE FROM tenant_records WHERE record_type=? AND id=?',['jobCosts','cost_01']),
  f=>f.sql('UPDATE tenant_records SET deleted_at=? WHERE record_type=? AND id=?',
   ['2026-10-31T01:00:00Z','jobCosts','cost_01']),
  f=>f.sql('UPDATE tenant_records SET payload=? WHERE record_type=? AND id=?',
   [JSON.stringify({id:'cost_01',businessId:'business_002',jobId,amount:120}),'jobCosts','cost_01'])
 ]){
  const f=fixture();
  try{
   addLinkedCost(f);
   const h=await host(f,principal);let calls=0;
   mutate(f);
   await assert.rejects(h.request(async()=>{calls++;return {text:'Never returned'}}),
    e=>e.code==='authorization_denied');
   assert.equal(calls,0);assert.equal(auditCount(f),0);
  }finally{f.close();}
 }
});

test('H04-11: company-scope evidence and context mutations cannot bypass post-inference checks',async()=>{
 const f=fixture();
 try{
  f.sql('INSERT INTO tenant_records (business_id,record_type,id,revision,payload) VALUES (?,?,?,?,?)',
   [businessId,'customers','customer_01',3,JSON.stringify({id:'customer_01',businessId,name:'Synthetic'})]);
  const {principal}=await verifiedIdentity();
  const {readIntelligenceContext}=await import('../src/intelligence-context.js');
  const {requestAuthorizedServerAdvisory}=await import('../src/advisory-authorization.js');
  const context=await readIntelligenceContext({db:f.db,principal,businessId});
  let calls=0;
  await assert.rejects(requestAuthorizedServerAdvisory({db:f.db,principal,context,
   env:advisoryEnv,intent:'evidence_gaps',transport:async()=>{
    calls++;f.sql('UPDATE tenant_records SET revision=4 WHERE business_id=? AND record_type=? AND id=?',
     [businessId,'customers','customer_01']);
    return {text:'Must not return after customer revision changes'};
   }}),e=>e.code==='authorization_denied');
  assert.equal(calls,1);
  const refreshed=await readIntelligenceContext({db:f.db,principal,businessId});
  await assert.rejects(requestAuthorizedServerAdvisory({db:f.db,principal,context:refreshed,
   env:advisoryEnv,intent:'evidence_gaps',transport:async()=>{
    refreshed.records[0].revision=99;
    return {text:'Must not return after context mutation'};
   }}),e=>e.code==='authorization_denied');
  assert.equal(auditCount(f),0);
 }finally{f.close();}
});
