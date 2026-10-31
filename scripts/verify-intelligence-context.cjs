// Actual browser + shared registry + server JWT/context code. Synthetic identity,
// in-memory read-only DB and seeded records; never a live account/production test.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fixture=require('../tests/fixtures/contractor-operating-flow-v1.json');
const out='artifacts/intelligence-context';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const {tenantApi}=await import('../src/tenant-api.js'),keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const issuer='https://synthetic-identity.example',subject='synthetic_owner',audience='local-context-test',identity={issuer,subject};
 const jwk={...await webcrypto.subtle.exportKey('jwk',keys.publicKey),kid:'test',alg:'RS256',use:'sig'},b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
 const now=Math.floor(Date.now()/1000),unsigned=b64({alg:'RS256',kid:'test'})+'.'+b64({iss:issuer,aud:audience,sub:subject,iat:now-5,exp:now+900});
 const bearer=unsigned+'.'+Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned))).toString('base64url');
 let role='owner',downgradeAfterRead=false,apiWrites=0;
 const db={prepare(sql){assert.ok(sql.startsWith('SELECT'),'Context host must never mutate');return {bind(...args){return {
  first:async()=>args[0]===fixture.businessId&&args[1]===issuer&&args[2]===subject?{role}:null,
  all:async()=>{if(sql.includes('JOIN businesses'))return {results:[{business_id:fixture.businessId,business_name:'Synthetic contractor',role}]};assert.ok(sql.includes('role=?'));assert.equal(args[0],fixture.businessId);assert.equal(args[1],fixture.businessId);assert.equal(args[2],issuer);assert.equal(args[3],subject);const types=args.slice(5);return {results:args[4]===role?fixture.records.filter(r=>types.includes(r.type)).map(r=>({record_type:r.type,id:r.id,revision:r.revision,updated_at:fixture.asOf,payload:JSON.stringify({id:r.id,businessId:fixture.businessId,...r.record})})):[]}}
 }}}}};
 const root=path.resolve('public'),server=http.createServer(async(req,res)=>{
  try{const url=new URL(req.url,'http://127.0.0.1:4199');if(url.pathname.startsWith('/api/v1/')){
   if(req.method!=='GET')apiWrites++;
   const response=await tenantApi(new Request(url,{method:req.method,headers:{Authorization:'Bearer '+bearer}}),{TF_DB:db,TF_OIDC_ISSUER:issuer,TF_OIDC_AUDIENCE:audience,TF_OIDC_JWKS_URL:issuer+'/certs'},{fetchJwks:async()=>Response.json({keys:[jwk]})});
   if(url.pathname.endsWith('/intelligence/context')&&downgradeAfterRead){role='member';downgradeAfterRead=false}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return}fs.readFile(file,(error,bytes)=>{if(error){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(bytes)});
  }catch(error){res.writeHead(500);res.end('Synthetic test host failure')}
 });
 await new Promise(r=>server.listen(4199,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']}),results=[];
 try{for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  role='owner';const browserContext=await browser.newContext({viewport,serviceWorkers:'block'}),page=await browserContext.newPage();await page.goto('http://127.0.0.1:4199');await page.waitForFunction(()=>!!window.TradeFlowPilot);
  const run=()=>page.evaluate(async()=>{
   const {createCloudReviewPort}=await import('/cloud-intelligence.js');const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   try{const commands=window.TradeFlowCommands,session=async()=>{const r=await fetch('/api/v1/me');return {status:'signed_in',...await r.json()}};let observed=null;
    const rt=commands.createRuntime({uid:()=>crypto.randomUUID(),context:()=>({actor:'synthetic_owner',businessId:'business_001'}),snapshot:async()=>({}),ledger:commands.createLedger(db),can:p=>p==='read',ports:{review:createCloudReviewPort({businessId:'business_001',jobId:'job_01',session,onContext:c=>{observed=c}})}});
    const plan=await rt.prepare('review business'),outcome=await rt.execute(plan.id),journal=await window.TradeFlowLocalRecovery.readStores(db,['commandLog']);return {outcome,observed,journal:journal.commandLog.filter(r=>r.id===plan.id)};
   }finally{db.close()}
  });
  const owner=await run();assert.equal(owner.outcome.status,'succeeded');assert.ok(owner.observed.records.some(r=>r.type==='payments'));assert.equal(owner.observed.providerSettlementVerified,false);assert.equal(owner.outcome.result.executionAuthority,false);assert.ok(!JSON.stringify(owner.journal).includes('Synthetic facility customer'));
  role='member';const member=await run();assert.equal(member.outcome.status,'succeeded');assert.ok(member.observed.records.every(r=>!['quotes','payments','invoices','jobCosts'].includes(r.type)));
  role='owner';downgradeAfterRead=true;const denied=await run();assert.equal(denied.outcome.status,'failed');assert.equal(denied.observed,null);
  await browserContext.setOffline(true);const offline=await run();assert.equal(offline.outcome.status,'failed');assert.equal(offline.observed,null);assert.equal(apiWrites,0);
  results.push({viewport,ownerContext:true,memberFinancialDataWithheld:true,midReadDowngradeDenied:true,offlineNoFabricatedContext:true,recordMutations:apiWrites,realCloudAccountTested:false});await browserContext.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r))}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({source:'Synthetic signed JWT and read-only DB; actual server authorization, browser and shared command registry',results},null,2));console.log('2/2 Chromium authorized intelligence context scenarios passed; synthetic identity/database, no business writes.');
})().catch(error=>{console.error(error);process.exitCode=1});
