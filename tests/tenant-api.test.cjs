'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {before}=require('node:test');
let api,verifier,keyPair,jwk;
const issuer='https://identity.example.test',audience='tradeflow-pilot',business='business_001';
const envBase={TF_OIDC_ISSUER:issuer,TF_OIDC_AUDIENCE:audience,TF_OIDC_JWKS_URL:issuer+'/.well-known/jwks.json'};
const b64=data=>Buffer.from(Buffer.isBuffer(data)?data:typeof data==='string'?data:JSON.stringify(data)).toString('base64url');
async function token(overrides={},signer=null){
 const now=Math.floor(Date.now()/1000),h=b64({alg:'RS256',typ:'JWT',kid:'primary'});
 const p=b64({iss:issuer,aud:audience,sub:'user_123',iat:now-5,exp:now+900,...overrides});
 const bytes=new TextEncoder().encode(h+'.'+p);
 const sig=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',signer||keyPair.privateKey,bytes);
 return h+'.'+p+'.'+b64(Buffer.from(sig));
}
const jwksResponse=async()=>new Response(JSON.stringify({keys:[jwk]}));
const db=(role='viewer',recordBusiness=business)=>({prepare(sql){return {bind(...params){return {
 async first(){
  if(sql.includes('FROM tradeflow_schema_migrations'))return {sha256:'e19a6c3d3016403357488db2159d5ff3643672f6b6b2c4908a37a036cc69add0'};
  if(sql.includes('FROM business_memberships'))return params[0]===business&&params[1]===issuer&&params[2]==='user_123'&&params[3]==='active'?{role}:null;
  if(sql.includes('FROM tenant_records'))return params[0]===recordBusiness?{payload:'{"name":"Private test job"}',revision:3,updated_at:'2026-10-29',deleted_at:null}:null;
  throw Error('Unexpected SQL');
 },async all(){return {results:[{business_id:business,business_name:'Test Contractor',role}]}}
 }}}}});
const req=(path,bearer,method='GET')=>new Request('https://pilot.example.test'+path,{method,headers:bearer?{Authorization:'Bearer '+bearer}:{}});
before(async()=>{
 ({tenantApi:api}=await import('../src/tenant-api.js'));
 ({verifyBearerToken:verifier}=await import('../src/oidc-verifier.js'));
 keyPair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 jwk={...await webcrypto.subtle.exportKey('jwk',keyPair.publicKey),kid:'primary',alg:'RS256',use:'sig'};
});
test('disabled without identity and D1 configuration',async()=>{
 const res=await api(req('/api/v1/me'),{});assert.equal(res.status,503);
});
test('accepts only signed, unexpired JWT for configured issuer and audience',async()=>{
 const verified=await verifier(req('/api/v1/me',await token()),envBase,{fetchJwks:jwksResponse});
 assert.equal(verified.subject,'user_123');assert.equal(verified.verified,true);
 for(const claims of [{iss:'https://evil.example.test'},{aud:'other-app'},{exp:1},{sub:'x'}]){
  await assert.rejects(verifier(req('/api/v1/me',await token(claims)),envBase,{fetchJwks:jwksResponse}));
 }
 const original=await token();const parts=original.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);const forged=parts.join('.');
 await assert.rejects(verifier(req('/api/v1/me',forged),envBase,{fetchJwks:jwksResponse}));
});
test('rejects missing credentials, incorrect method and untrusted JWKS origin',async()=>{
 const env={...envBase,TF_DB:db()};
 assert.equal((await api(req('/api/v1/me'),env,{fetchJwks:jwksResponse})).status,401);
 assert.equal((await api(req('/api/v1/me',await token(),'POST'),env,{fetchJwks:jwksResponse})).status,405);
 await assert.rejects(verifier(req('/api/v1/me',await token()),{...envBase,TF_OIDC_JWKS_URL:'https://evil.example.test/jwks'},{fetchJwks:jwksResponse}),{status:503});
});
test('lists only memberships for verified subject',async()=>{
 const res=await api(req('/api/v1/me',await token()),{...envBase,TF_DB:db()},{fetchJwks:jwksResponse});
 assert.equal(res.status,200);const body=await res.json();assert.equal(body.businesses[0].business_id,business);assert.deepEqual(body.identity,{issuer,subject:'user_123'});
});
test('reads only tenant-scoped records with verified membership',async()=>{
 const path='/api/v1/businesses/'+business+'/records/jobs/job_123';
 const signed=await token(),env={...envBase,TF_DB:db()};
 const good=await api(req(path,signed),env,{fetchJwks:jwksResponse});
 assert.equal(good.status,200);assert.equal((await good.json()).record.name,'Private test job');
 const forbidden=await api(req('/api/v1/businesses/business_999/records/jobs/job_123',signed),env,{fetchJwks:jwksResponse});
 assert.equal(forbidden.status,403);
 const absent=await api(req(path,signed),{...envBase,TF_DB:db('viewer','business_999')},{fetchJwks:jwksResponse});
 assert.equal(absent.status,404);
 const invalid=await api(req('/api/v1/businesses/'+business+'/records/unknown/job_123',signed),env,{fetchJwks:jwksResponse});
 assert.equal(invalid.status,400);
});

test('PUT requires signed identity, active writer membership and expected revision',async()=>{
 const path='/api/v1/businesses/'+business+'/records/jobs/job_123';
 const signed=await token();
 const request=()=>new Request('https://pilot.example.test'+path,{method:'PUT',headers:{Authorization:'Bearer '+signed,'Content-Type':'application/json'},body:JSON.stringify({revision:3,record:{name:'Changed'}})});
 const denied=await api(request(),{...envBase,TF_DB:db('viewer')},{fetchJwks:jwksResponse});
 assert.equal(denied.status,403);
 const noToken=await api(new Request('https://pilot.example.test'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'}),{...envBase,TF_DB:db('member')},{fetchJwks:jwksResponse});
 assert.equal(noToken.status,401);
 const wrongBusiness=await api(new Request('https://pilot.example.test/api/v1/businesses/business_999/records/jobs/job_123',{method:'PUT',headers:{Authorization:'Bearer '+signed,'Content-Type':'application/json'},body:'{}'}),{...envBase,TF_DB:db('owner')},{fetchJwks:jwksResponse});
 assert.equal(wrongBusiness.status,403);
 const badPayload=await api(new Request('https://pilot.example.test'+path,{method:'PUT',headers:{Authorization:'Bearer '+signed,'Content-Type':'application/json'},body:JSON.stringify({record:{}})}),{...envBase,TF_DB:db('member')},{fetchJwks:jwksResponse});
 assert.equal(badPayload.status,400,'JSON without required revision is an invalid record');
 const wrongType=await api(new Request('https://pilot.example.test'+path,{method:'PUT',headers:{Authorization:'Bearer '+signed,'Content-Type':'text/plain'},body:'{}'}),{...envBase,TF_DB:db('member')},{fetchJwks:jwksResponse});
 assert.equal(wrongType.status,415,'Unsupported content type remains rejected');
});

test('Cloudflare Access assertion is signed, audience-pinned, and cannot be spoofed',async()=>{
 const signed=await token();
 const request=new Request('https://pilot.example.test/api/v1/me',{headers:{'Cf-Access-Jwt-Assertion':signed}});
 const result=await verifier(request,envBase,{fetchJwks:jwksResponse});
 assert.equal(result.subject,'user_123');
 const bad=new Request('https://pilot.example.test/api/v1/me',{headers:{'Cf-Access-Jwt-Assertion':signed.slice(0,-5)+'xxxxx'}});
 await assert.rejects(verifier(bad,envBase,{fetchJwks:jwksResponse}),{status:401});
 const env={...envBase,TF_DB:db()};
 const success=await api(request,env,{fetchJwks:jwksResponse});
 assert.equal(success.status,200);
});
test('authenticated login returns only to the fixed local app and cannot grant membership',async()=>{
 const res=await api(req('/api/v1/session/login?redirect=https://evil.example',await token()),{...envBase,TF_DB:db()},{fetchJwks:jwksResponse});
 assert.equal(res.status,303);assert.equal(res.headers.get('Location'),'/?account=connected');assert.equal(res.headers.get('Cache-Control'),'no-store');
 assert.equal((await api(req('/api/v1/session/login'),{...envBase,TF_DB:db()},{fetchJwks:jwksResponse})).status,401);
});
test('malformed JWT objects fail as authentication errors, never server errors',async()=>{
 for(const header of [null,[],42]){
  const malformed=b64(header)+'.'+b64({})+'.YWJj';
  assert.equal((await api(req('/api/v1/me',malformed),{...envBase,TF_DB:db()},{fetchJwks:jwksResponse})).status,401);
 }
});
test('extended routes are disabled until migration activation and financial writes need stronger permission',async()=>{
 const signed=await token(),path='/api/v1/businesses/'+business+'/records/payments/payment_1';
 assert.equal((await api(req(path,signed),{...envBase,TF_DB:db('owner')},{fetchJwks:jwksResponse})).status,400);
 const denied=await api(new Request('https://pilot.example.test'+path,{method:'PUT',headers:{Authorization:'Bearer '+signed,'Content-Type':'application/json'},body:JSON.stringify({revision:0,record:{id:'payment_1',amount:25}})}),{...envBase,TF_EXTENDED_RECORDS_ENABLED:'true',TF_DB:db('member')},{fetchJwks:jwksResponse});
 assert.equal(denied.status,403);
 const me=await api(req('/api/v1/me',signed),{...envBase,TF_DB:db('owner')},{fetchJwks:jwksResponse});assert.equal((await me.json()).capabilities.recordTypes.length,4);
});

test('cloud catalogue is tenant-authorized, bounded, cursor-paged and read-only',async()=>{
 const signed=await token(),prefix='/api/v1/businesses/'+business+'/records/jobs';
 const source=Array.from({length:51},(_,n)=>({id:'job_'+String(n).padStart(3,'0'),revision:2,updated_at:'2026-10-29',payload:JSON.stringify({name:'Synthetic job '+n})}));
 let reads=0,writes=0;
 const store={
  prepare(sql){return {bind(...params){return {
   async first(){
    if(sql.includes('FROM tradeflow_schema_migrations'))return {sha256:'e19a6c3d3016403357488db2159d5ff3643672f6b6b2c4908a37a036cc69add0'};
    if(sql.includes('FROM business_memberships'))return params[0]===business?{role:'viewer'}:null;
    throw Error('Unexpected first query');
   },
   async all(){
    if(!sql.includes('FROM tenant_records')||!sql.includes('LIMIT 51'))throw Error('Unbounded catalogue');
    reads++;
    assert.equal(params[0],business);assert.equal(params[1],'jobs');
    return {results:source.filter(row=>row.id>params[2]).slice(0,51)};
   },
   async run(){writes++;throw Error('Catalogue must not write')}
  }}}}
 };
 const env={...envBase,TF_DB:store},options={fetchJwks:jwksResponse};
 const first=await api(req(prefix,signed),env,options);
 assert.equal(first.status,200);
 const body=await first.json();assert.equal(body.items.length,50);assert.equal(body.nextCursor,'job_049');
 assert.equal(body.items[0].record.name,'Synthetic job 0');
 assert.equal(body.items[0].revision,2);
 const next=await api(req(prefix+'?after='+body.nextCursor,signed),env,options);
 assert.equal(next.status,200);assert.equal((await next.json()).items.length,1);
 assert.equal((await api(req(prefix+'?after=not%2Fsafe',signed),env,options)).status,400);
 assert.equal((await api(req(prefix+'?limit=10000',signed),env,options)).status,400);
 assert.equal((await api(req('/api/v1/businesses/business_999/records/jobs',signed),env,options)).status,403);
 assert.equal((await api(req(prefix),env,options)).status,401);
 assert.equal(reads,2);assert.equal(writes,0);
});

test('API rejects crew administration by members despite owner-like fields in the roster payload',async()=>{
 const signed=await token(),path='/api/v1/businesses/'+business+'/records/crew/crew_001';
 const request=new Request('https://pilot.example.test'+path,{method:'PUT',headers:{Authorization:'Bearer '+signed,'Content-Type':'application/json'},body:JSON.stringify({revision:0,record:{name:'Display only',role:'owner',permissions:['members:manage']}})});
 const res=await api(request,{...envBase,TF_DB:db('member'),TF_EXTENDED_RECORDS_ENABLED:'true'},{fetchJwks:jwksResponse});assert.equal(res.status,403);
});

test('read-only context route verifies identity and rejects client role/tool/scope overrides',async()=>{
 const signed=await token(),path='/api/v1/businesses/'+business+'/intelligence/context';
 const contextDb={prepare(sql){return {bind(...args){return {first:async()=>args[0]===business?{role:'member'}:null,all:async()=>({results:[{record_type:'jobs',id:'job_123',revision:2,updated_at:'2026-10-30',payload:JSON.stringify({id:'job_123',businessId:business,title:'Authorized job'})}]})}}}}};
 const env={...envBase,TF_DB:contextDb},options={fetchJwks:jwksResponse};const good=await api(req(path,signed),env,options);assert.equal(good.status,200);const data=await good.json();assert.equal(data.readOnly,true);assert.equal(data.executionAuthority,false);assert.equal(data.records[0].id,'job_123');assert.equal(data.permission.role,'member');
 assert.equal((await api(req(path),env,options)).status,401);
 assert.equal((await api(req(path.replace(business,'business_999'),signed),env,options)).status,403);
 for(const suffix of ['?role=owner','?businessId=foreign','?tools=send','?jobId=job_123&jobId=other'])assert.equal((await api(req(path+suffix,signed),env,options)).status,400);
 assert.equal((await api(req(path,signed,'POST'),env,options)).status,405);
});
