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
