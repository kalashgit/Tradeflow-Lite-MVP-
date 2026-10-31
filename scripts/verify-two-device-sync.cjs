// Synthetic authenticated devices; actual shared queue/JWT/API/write SQL/audit
// triggers against isolated temporary SQLite. No live D1, Access or provisioning.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='artifacts/two-device-sync';fs.mkdirSync(out,{recursive:true});
let server,browser,temp;
(async()=>{
 const {tenantApi}=await import('../src/tenant-api.js'),issuer='https://synthetic-sync.example',subject='synthetic_owner',audience='local-sync-test';
 const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await webcrypto.subtle.exportKey('jwk',keys.publicKey),kid:'test',alg:'RS256',use:'sig'},b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);
 const unsigned=b64({alg:'RS256',kid:'test'})+'.'+b64({iss:issuer,aud:audience,sub:subject,iat:now-5,exp:now+1800});
 const bearer=unsigned+'.'+Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned))).toString('base64url');
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'tradeflow-two-device-'));let database,dropAckId=null;const puts=[];
 function sql(query,params=[]){return JSON.parse(cp.execFileSync('python3',['tests/helpers/sqlite-tenant-host.py'],{input:JSON.stringify({database,sql:query,params}),encoding:'utf8'}))}
 const db={prepare(query){return {bind(...params){return {first:async()=>sql(query,params)[0]||null,all:async()=>({results:sql(query,params)})}}}}};
 const root=path.resolve('public');
 server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1:4201');if(url.pathname.startsWith('/api/v1/')){
   let body='';for await(const chunk of req)body+=chunk;
   const request=new Request(url,{method:req.method,headers:{Authorization:'Bearer '+bearer,...(body?{'Content-Type':'application/json'}:{})},...(body?{body}:{})});
   const response=await tenantApi(request,{TF_DB:db,TF_OIDC_ISSUER:issuer,TF_OIDC_AUDIENCE:audience,TF_OIDC_JWKS_URL:issuer+'/certs'},{fetchJwks:async()=>Response.json({keys:[jwk]})});
   if(req.method==='PUT'){puts.push({path:url.pathname,status:response.status});if(dropAckId&&url.pathname.endsWith('/'+dropAckId)&&[200,201].includes(response.status)){dropAckId=null;res.writeHead(response.status,Object.fromEntries(response.headers));res.end('{');return}}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return}
  fs.readFile(file,(error,bytes)=>{if(error){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(bytes)});
 }catch(error){res.writeHead(500);res.end('Synthetic test host failure')}});
 await new Promise(r=>server.listen(4201,'127.0.0.1',r));browser=await chromium.launch({args:['--no-sandbox']});const results=[];
 async function boot(page){await page.goto('http://127.0.0.1:4201');await page.waitForFunction(()=>!!window.TradeFlowPilot&&!!window.TradeFlowAccountSession);await page.evaluate(async()=>{
  const {createSyncQueue,createTenantTransport,summarizeSyncIntents}=await import('/sync-queue.js');const request=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  window.__syncNow=Date.now()+61000;window.__syncQ=createSyncQueue({db,businessId:'business_001',session:()=>window.TradeFlowAccountSession.readSession(),transport:createTenantTransport('business_001'),now:()=>window.__syncNow});window.__syncSummary=async()=>summarizeSyncIntents(await window.__syncQ.list(),'business_001');
 })}
 const enqueue=(page,id,operationId,baseRevision,title)=>page.evaluate(c=>window.__syncQ.enqueue(c),{type:'jobs',id,operationId,baseRevision,record:{id,title}});
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  database=path.join(temp,'fixture-'+viewport.width+'.sqlite');puts.length=0;cp.execFileSync('python3',['tests/helpers/sqlite-tenant-host.py'],{input:JSON.stringify({database,initialize:true,issuer,subject}),encoding:'utf8'});
  const deviceA=await browser.newContext({viewport,serviceWorkers:'block'}),deviceB=await browser.newContext({viewport,serviceWorkers:'block'}),a=await deviceA.newPage(),b=await deviceB.newPage();await boot(a);await boot(b);
  await enqueue(b,'job_01','server_seed',0,'Original');await b.evaluate(()=>window.__syncQ.drain());
  assert.equal(sql("SELECT revision FROM tenant_records WHERE id='job_01'")[0].revision,1);
  const local=await a.evaluate(()=>window.TradeFlowAccountSession.readSession());assert.equal(local.status,'signed_in');
  const basis=await a.evaluate(async()=>{const {createTenantTransport}=await import('/sync-queue.js');return createTenantTransport('business_001').read('jobs','job_01')});assert.equal(basis.status,200);assert.equal(basis.record.revision,1);
  await deviceA.setOffline(true);await enqueue(a,'job_01','device_a_edit',basis.record.revision,'Device A draft');const offline=await a.evaluate(()=>window.__syncQ.drain());assert.equal(offline.status,'authorization_required');
  await enqueue(b,'job_01','device_b_edit',1,'Device B revision');await b.evaluate(()=>window.__syncQ.drain());
  await deviceA.setOffline(false);await a.evaluate(()=>window.__syncQ.drain());const conflict=await a.evaluate(()=>window.__syncSummary());assert.equal(conflict.items.find(r=>r.operationId==='device_a_edit').state,'conflict_needs_review');assert.equal(conflict.allRemotelyVerified,false);
  let stored=sql("SELECT revision,payload FROM tenant_records WHERE id='job_01'")[0];assert.equal(stored.revision,2);assert.equal(JSON.parse(stored.payload).title,'Device B revision');assert.equal(sql('SELECT COUNT(*) n FROM tenant_audit_events')[0].n,2);
  dropAckId='job_ack';await enqueue(a,'job_ack','lost_ack',0,'Committed despite lost response');await a.evaluate(()=>window.__syncQ.drain());const uncertain=await a.evaluate(()=>window.__syncSummary());assert.equal(uncertain.items.find(r=>r.operationId==='lost_ack').state,'indeterminate');
  await boot(a);await a.evaluate(()=>{window.__syncNow+=61000;return window.__syncQ.drain()});const converged=await a.evaluate(()=>window.__syncSummary());assert.equal(converged.items.find(r=>r.operationId==='lost_ack').state,'committed_verified');
  await a.evaluate(()=>window.__syncQ.drain());assert.equal(puts.filter(p=>p.path.endsWith('/job_ack')).length,1);assert.equal(sql("SELECT COUNT(*) n FROM tenant_audit_events WHERE record_id='job_ack'")[0].n,1);
  await deviceA.setOffline(true);await enqueue(a,'job_revoked','revoked_offline',0,'Offline draft to retain');const auditBefore=sql('SELECT COUNT(*) n FROM tenant_audit_events')[0].n;
  sql("UPDATE business_memberships SET status='suspended' WHERE business_id='business_001'");await deviceA.setOffline(false);assert.equal((await a.evaluate(()=>window.__syncQ.drain())).status,'authorization_required');
  const serverDenied=await b.evaluate(async()=>{const r=await fetch('/api/v1/businesses/business_001/records/jobs/job_revoked',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:0,record:{id:'job_revoked',title:'Direct request cannot bypass authorization'}})});return r.status});assert.equal(serverDenied,403);
  const revoked=await a.evaluate(()=>window.__syncSummary());assert.equal(revoked.items.find(r=>r.operationId==='revoked_offline').externalCommitted,false);assert.equal(sql('SELECT COUNT(*) n FROM tenant_audit_events')[0].n,auditBefore);assert.equal(sql("SELECT COUNT(*) n FROM tenant_records WHERE id='job_revoked'")[0].n,0);
  results.push({viewport,observations:{serverJobRevision:stored.revision,conflictState:conflict.items.find(r=>r.operationId==='device_a_edit').state,lostAcknowledgmentState:uncertain.items.find(r=>r.operationId==='lost_ack').state,reconciledState:converged.items.find(r=>r.operationId==='lost_ack').state,revokedState:revoked.items.find(r=>r.operationId==='revoked_offline').state,deniedHttpStatus:serverDenied,auditRowsBeforeDeniedWrite:auditBefore,auditRowsAfterDeniedWrite:sql('SELECT COUNT(*) n FROM tenant_audit_events')[0].n},separateDeviceStores:true,actualSignedJwtVerified:true,actualSqlCasAndAudit:true,competingRevisionRetained:true,offlineConflictNotCommitted:true,lostAckConvergedWithoutReplay:true,serverRevocationDenied:true,deniedWriteAuditEffects:0,liveCloudOrPhysicalDevices:false});
  fs.copyFileSync(database,path.join(out,'synthetic-'+viewport.width+'.sqlite'));await deviceA.close();await deviceB.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({sha:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!cp.execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),source:'Actual two-browser queue/JWT/API/SQL, synthetic identity and temporary SQLite',results},null,2));console.log('2/2 Chromium authenticated two-device sync scenarios passed; synthetic identity and SQLite, no live cloud.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));if(temp)fs.rmSync(temp,{recursive:true,force:true})});
