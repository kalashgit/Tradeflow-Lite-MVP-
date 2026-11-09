'use strict';
const {test,before}=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
let DatabaseSync;
try{({DatabaseSync}=require('node:sqlite'))}catch{}
let api,keyPair,jwk;
const issuer='https://identity.example.test',audience='tradeflow-pilot',business='business_001';
const envBase={TF_OIDC_ISSUER:issuer,TF_OIDC_AUDIENCE:audience,TF_OIDC_JWKS_URL:issuer+'/.well-known/jwks.json'};
const b64=data=>Buffer.from(Buffer.isBuffer(data)?data:typeof data==='string'?data:JSON.stringify(data)).toString('base64url');
async function token(overrides={}){
 const now=Math.floor(Date.now()/1000),header=b64({alg:'RS256',typ:'JWT',kid:'primary'});
 const payload=b64({iss:issuer,aud:audience,sub:'owner_001',iat:now-5,exp:now+900,...overrides});
 const bytes=new TextEncoder().encode(header+'.'+payload);
 const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,bytes);
 return header+'.'+payload+'.'+b64(Buffer.from(signature));
}
const jwksResponse=async()=>new Response(JSON.stringify({keys:[jwk]}));
function fixture(role='owner'){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE business_memberships(business_id TEXT,issuer TEXT,subject TEXT,status TEXT,role TEXT); CREATE TABLE tenant_records(business_id TEXT,record_type TEXT,id TEXT,revision INTEGER,payload TEXT,updated_at TEXT,deleted_at TEXT);');
 sql.prepare('INSERT INTO business_memberships VALUES (?,?,?,?,?)').run(business,issuer,'owner_001','active',role);
 let recordReads=0,writes=0,onRead=()=>{};
 return {
  sql,
  add(type,id,record={},tenant=business,revision=2){sql.prepare('INSERT INTO tenant_records VALUES (?,?,?,?,?,?,NULL)').run(tenant,type,id,revision,JSON.stringify({id,businessId:tenant,...record}),'2026-11-08T00:00:00Z')},
  onRead(fn){onRead=fn},reads(){return recordReads},writes(){return writes},
  db:{prepare(statement){
   if(!/^SELECT\b/i.test(statement.trim())){writes++;throw Error('Financial evidence must not write SQL')}
   return {bind(...args){return {
    async first(){return sql.prepare(statement).get(...args)||null},
    async all(){
     const result=sql.prepare(statement).all(...args);
     if(statement.includes('FROM tenant_records')){recordReads++;onRead(recordReads)}
     return {results:result};
    }
   }}}
  }}
 };
}
const endpoint=(tenant=business)=>'/api/v1/businesses/'+tenant+'/intelligence/financial-evidence';
const request=(path,signed,method='GET',headers={})=>new Request('https://pilot.example.test'+path,{method,headers:{...(signed?{Authorization:'Bearer '+signed}:{}),...headers}});
const call=(f,path,signed)=>api(request(path,signed),{...envBase,TF_DB:f.db,TF_EXTENDED_RECORDS_ENABLED:'false'},{fetchJwks:jwksResponse});
before(async()=>{
 if(!DatabaseSync)return;
 ({tenantApi:api}=await import('../src/tenant-api.js'));
 keyPair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 jwk={...await webcrypto.subtle.exportKey('jwk',keyPair.publicKey),kid:'primary',alg:'RS256',use:'sig'};
});
const run=(title,fn)=>test(title,{skip:!DatabaseSync?'node:sqlite unavailable; requires Node 22+':false},fn);
run('signed owner receives only server-attested record refs and missing financial claims',async()=>{
 const f=fixture();f.add('invoices','invoice_1',{amount:10000,bankVerified:true,notes:'UNTRUSTED INVOICE NOTE'});
 f.add('payments','payment_1',{amount:10000,settlementVerified:true});
 f.add('supplyOrders','supplier_4800',{amount:4800,dueDate:'2026-11-17'});
 const res=await call(f,endpoint()+'?asOfDate=2026-11-09',await token());assert.equal(res.status,200);
 const data=await res.json();assert.equal(data.kind,'tradeflow.financial.evidence.v1');assert.equal(data.status,'missing_data');
 assert.equal(data.sourceKind,'verified_tenant_record');assert.equal(data.scope.businessId,business);
 assert.deepEqual(data.scope.actor,{issuer,subject:'owner_001',role:'owner'});
 assert.deepEqual(data.period,{startDate:'2026-11-09',endDate:'2026-11-22'});
 assert.equal(data.amountUnit,'minor_cents');assert.equal(data.cash.availableMinor,null);
 assert.equal(data.receivables.openMinor,null);assert.equal(data.afterObligationsMinor,null);
 assert.equal(data.cash.bankVerified,false);assert.equal(data.obligationsComplete,false);
 assert.equal(data.coverage.suppliers,'unknown');assert.equal(data.executionAuthority,false);
 assert.deepEqual(data.recordRefs.map(x=>[x.type,x.id,x.revision]),[['invoices','invoice_1',2],['payments','payment_1',2]]);
 assert.ok(!JSON.stringify(data).includes('UNTRUSTED INVOICE NOTE'));
 assert.equal(f.reads(),2);assert.equal(f.writes(),0);
});
run('caller cannot forge authorization, trust tier, obligations coverage, reference IDs or reporting period',async()=>{
 const f=fixture();f.add('invoices','invoice_1',{amount:900000});const signed=await token();
 for(const spoof of ['verified=true','authorization.verified=true','sourceKind=verified_tenant_record','recordRefs=invoices%3Afake%401','role=owner','obligationsComplete=true','startDate=2026-11-10','period.endDate=2026-11-23','businessTimeZone=America%2FChicago']){
  const res=await call(f,endpoint()+'?asOfDate=2026-11-09&'+spoof,signed);
  assert.equal(res.status,400,spoof);
 }
 const spoofedHeader=await api(request(endpoint()+'?asOfDate=2026-11-09',signed,'GET',{'X-Tradeflow-Verified':'true','X-Tradeflow-Role':'admin'}),{...envBase,TF_DB:f.db},{fetchJwks:jwksResponse});
 assert.equal(spoofedHeader.status,200);assert.equal((await spoofedHeader.json()).scope.actor.role,'owner');
 assert.equal(f.writes(),0);
});
run('invalid, impossible, future-shifted and multiple date inputs fail; leap window is Gregorian',async()=>{
 const f=fixture(),signed=await token();
 for(const query of ['asOfDate=2026-02-30','asOfDate=2025-02-29','asOfDate=2026-11-09T00%3A00%3A00Z','asOfDate=0000-01-01','asOfDate=9999-12-31','asOfDate=2026-11-09&asOfDate=2026-11-10']){
  assert.equal((await call(f,endpoint()+'?'+query,signed)).status,400,query);
 }
 const valid=await call(f,endpoint()+'?asOfDate=2024-02-29',signed);
 assert.equal(valid.status,200);assert.deepEqual((await valid.json()).period,{startDate:'2024-02-29',endDate:'2024-03-13'});
});
run('unsigned, foreign tenant, viewer, member and revoked identities receive no financial evidence',async()=>{
 const signed=await token(),f=fixture();f.add('invoices','invoice_1',{amount:100});
 assert.equal((await call(f,endpoint(),null)).status,401);
 assert.equal((await call(f,endpoint('business_999'),signed)).status,403);
 for(const role of ['viewer','member']){const actor=fixture(role);actor.add('invoices','invoice_1',{amount:100});
  const res=await call(actor,endpoint(),signed);assert.equal(res.status,403);assert.ok(!(await res.text()).includes('invoice_1'))}
 f.sql.exec("UPDATE business_memberships SET status='revoked'");
 assert.equal((await call(f,endpoint(),signed)).status,403);assert.equal(f.writes(),0);
});
run('revocation and owner-to-viewer downgrade mid-query fail closed',async()=>{
 for(const mutation of ["UPDATE business_memberships SET status='revoked'","UPDATE business_memberships SET role='viewer'"]){
  const f=fixture();f.add('invoices','invoice_1',{amount:100});f.onRead(n=>{if(n===1)f.sql.exec(mutation)});
  const res=await call(f,endpoint(),await token());assert.equal(res.status,403);assert.ok(!(await res.text()).includes('invoice_1'));
 }
});
run('corrupt foreign-tenant payloads and invalid row provenance are rejected',async()=>{
 const signed=await token();
 for(const record of [{id:'invoice_1',businessId:'business_999',amount:100},{id:'invoice_2',businessId:business,amount:100}]){
  const f=fixture();f.add('invoices','invoice_1',record);
  const res=await call(f,endpoint(),signed);assert.equal(res.status,503);assert.ok(!(await res.text()).includes('invoice_1'));
 }
 const invalid=fixture();invalid.add('invoices','invoice_1',{},business,0);
 assert.equal((await call(invalid,endpoint(),signed)).status,503);
});
run('changed invoice revision, deleted evidence or new row between snapshots aborts with 409',async()=>{
 const signed=await token();
 for(const mutation of ["UPDATE tenant_records SET revision=revision+1 WHERE id='invoice_1'","UPDATE tenant_records SET deleted_at='2026-11-09' WHERE id='invoice_1'","INSERT INTO tenant_records VALUES ('business_001','invoices','invoice_2',1,'{}','2026-11-09',NULL)"]){
  const f=fixture();f.add('invoices','invoice_1',{});f.onRead(n=>{if(n===1)f.sql.exec(mutation)});
  const res=await call(f,endpoint(),signed);assert.equal(res.status,409,mutation);assert.ok(!(await res.text()).includes('invoice_1'));
 }
});
run('201 visible records prevent partial financial snapshots and do not write',async()=>{
 const f=fixture();for(let i=0;i<201;i++)f.add('invoices','invoice_'+String(i).padStart(3,'0'),{amount:100});
 const res=await call(f,endpoint(),await token());assert.equal(res.status,413);assert.equal(f.writes(),0);
});
