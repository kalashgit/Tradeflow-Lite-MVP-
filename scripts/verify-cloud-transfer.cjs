// Real browser UI + IndexedDB; authenticated API is a controlled fixture, not a real owner session.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.OUTPUT_DIR||'artifacts/cloud-transfer';fs.mkdirSync(out,{recursive:true});
const root=path.resolve('public'),types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local'),p=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!p.startsWith(root+'/')){res.writeHead(403);res.end();return}fs.readFile(p,(e,b)=>{if(e){res.writeHead(404);res.end();return}res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(b)})});
(async()=>{
 const model=await import('../public/record-model.js');await new Promise(r=>server.listen(4194,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']}),results=[];
 try{for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),remote=new Map(),writes=[];let signedIn=true;
  page.on('dialog',async dialog=>{assert.equal(dialog.type(),'confirm');assert.ok(dialog.message().includes('Transfer 4 reviewed record'));await dialog.accept()});
  await page.route('**/api/v1/me',route=>route.fulfill({status:signedIn?200:401,json:signedIn?{identity:{issuer:'https://synthetic-session.example',subject:'test-owner'},businesses:[{business_id:'business_001',business_name:'Synthetic destination',role:'owner'}],capabilities:{recordTypes:model.RECORD_TYPES,extendedRecords:true,schemaVersion:3}}:{error:'Expired'}}));
  await page.route('**/api/v1/businesses/business_001/records/**',async route=>{
   const req=route.request(),parts=new URL(req.url()).pathname.split('/'),type=parts.at(-2),id=parts.at(-1),key=type+':'+id;
   if(req.method()==='GET'){const row=remote.get(key);await route.fulfill({status:row?200:404,json:row?{id,type,revision:row.revision,record:row.record}:{error:'Not found'}});return}
   assert.equal(req.method(),'PUT');const body=req.postDataJSON();if(remote.has(key)){await route.fulfill({status:409,json:{error:'Revision conflict'}});return}
   if(type==='jobs')assert.ok(remote.has('customers:c1'));if(type==='invoices')assert.ok(remote.has('jobs:j1'));if(type==='payments')assert.ok(remote.has('invoices:i1'));
   writes.push(key);remote.set(key,{revision:1,record:body.record});await route.fulfill({status:201,json:{id,type,revision:1,updatedAt:'2026-10-29T00:00:00Z'}});
  });
  await page.goto('http://127.0.0.1:4194');await page.waitForFunction(()=>!!window.TradeFlowPilot);
  await page.evaluate(async()=>{const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result)),tx=db.transaction([...db.objectStoreNames],'readwrite');for(const s of db.objectStoreNames)tx.objectStore(s).clear();
   tx.objectStore('settings').put({id:'business',company:'Synthetic transfer source',primaryTrade:'Plumbing',onboardingComplete:true});tx.objectStore('customers').put({id:'c1',name:'Synthetic customer',businessId:'local-business',custom:'Keep original'});tx.objectStore('jobs').put({id:'j1',title:'Synthetic job',customerId:'c1'});tx.objectStore('invoices').put({id:'i1',jobId:'j1',customerId:'c1',status:'Draft'});tx.objectStore('payments').put({id:'p1',invoiceId:'i1',customerId:'c1',amount:25});await new Promise(r=>tx.oncomplete=r);db.close();});
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
  await page.evaluate(async()=>{const c=window.TradeFlowPilot.commands,p=await c.prepare('open settings');if((await c.execute(p.id)).status!=='succeeded')throw Error('Settings failed')});
  await page.locator('[data-action="settingsPanel"][data-panel="backup"]').click();await page.locator('[data-action="cloudTransferReview"]').click();await page.locator('[data-transfer-business]').waitFor();
  await page.locator('[data-transfer-action="prepare"]').click();await page.waitForFunction(()=>document.querySelector('[data-transfer-status]')?.textContent.includes('Transfer blocked'));
  assert.equal(writes.length,0);await page.locator('[data-transfer-map]').check();
  for(let attempt=0;attempt<2;attempt++){
   await page.locator('[data-transfer-action="prepare"]').click();await page.waitForFunction(()=>document.querySelector('[data-transfer-status]')?.textContent.includes('save the backup'));
   assert.equal(await page.locator('[data-transfer-action="transfer"]').isDisabled(),true);
   const downloadPromise=page.waitForEvent('download');await page.locator('[data-transfer-action="backup"]').click();const download=await downloadPromise;const file=path.join(out,'backup-'+viewport.width+'-'+attempt+'.json');await download.saveAs(file);assert.ok(JSON.parse(fs.readFileSync(file)).integrity.sha256);
   await page.locator('[data-transfer-backup]').check();await page.locator('[data-transfer-action="transfer"]').click();await page.waitForFunction(()=>document.querySelector('[data-transfer-status]')?.textContent.includes('4 reviewed record(s) are confirmed'));
  }
  assert.deepEqual(writes,['customers:c1','jobs:j1','invoices:i1','payments:p1']);assert.equal(remote.get('customers:c1').record.businessId,'business_001');
  const unchanged=await page.evaluate(async()=>{const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result)),r=await window.TradeFlowLocalRecovery.readStores(db,['customers','jobs','payments']);db.close();return r});
  assert.equal(unchanged.customers[0].businessId,'local-business');assert.equal(unchanged.customers[0].custom,'Keep original');assert.equal(unchanged.payments[0].amount,25);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.tf-transfer').screenshot({path:path.join(out,'completed-'+viewport.width+'.png')});
  // Session expiry before approval must not upload a later review.
  await page.locator('[data-transfer-action="prepare"]').click();await page.waitForFunction(()=>document.querySelector('[data-transfer-status]')?.textContent.includes('save the backup'));
  signedIn=false;const expired=page.waitForEvent('download');await page.locator('[data-transfer-action="backup"]').click();await expired;await page.locator('[data-transfer-backup]').check();await page.locator('[data-transfer-action="transfer"]').click();await page.waitForFunction(()=>document.querySelector('[data-transfer-status]')?.textContent.includes('session changed'));assert.equal(writes.length,4);
  results.push({viewport,approvedTransfer:true,explicitMapping:true,backupGate:true,parentOrder:true,repeatedSubmissionDidNotDuplicate:true,localRecordsPreserved:true,expiryBlocked:true,realCloudOrOwnerTested:false});await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r))}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({source:'synthetic API/session; actual browser UI and IndexedDB',results},null,2));console.log('PASS: phone/desktop reviewed transfer, backup+approval gates, dependency order, replay, local preservation and expired-session denial.');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
