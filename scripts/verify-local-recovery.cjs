// Real browser/IndexedDB recovery and offline reload; isolated synthetic test data only.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.OUTPUT_DIR||'/tmp/tradeflow-recovery';fs.mkdirSync(out,{recursive:true});
const root=path.resolve('public'),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local'),p=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!p.startsWith(root+'/')){res.writeHead(403);res.end();return}fs.readFile(p,(error,body)=>{if(error){res.writeHead(404);res.end();return}res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(body)})});
(async()=>{
 await new Promise(r=>server.listen(4192,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']});
 try{for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),dialogs=[];
  page.on('dialog',async dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});await dialog.accept().catch(()=>{})});
  await page.goto('http://127.0.0.1:4192');await page.waitForFunction(()=>!!window.TradeFlowLocalRecovery);
  const backup=await page.evaluate(async()=>{
   const req=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>req.onsuccess=()=>r(req.result)),stores=[...db.objectStoreNames];
   const tx=db.transaction(stores,'readwrite');for(const s of stores)tx.objectStore(s).clear();
   tx.objectStore('settings').put({id:'business',company:'Recovery test',primaryTrade:'Electrical',onboardingComplete:true});
   tx.objectStore('customers').put({id:'recovery-customer',name:'Before edit',custom:'Preserved field'});
   tx.objectStore('jobs').put({id:'recovery-job',customerId:'recovery-customer',title:'Synthetic recovery test'});
   tx.objectStore('payments').put({id:'recovery-payment',customerId:'recovery-customer',jobId:'recovery-job',amount:25});
   await new Promise(r=>tx.oncomplete=r);const result=await window.TradeFlowLocalRecovery.createBackup(db,stores);
   const edit=db.transaction('customers','readwrite');edit.objectStore('customers').put({id:'recovery-customer',name:'After edit',custom:'Preserved field'});await new Promise(r=>edit.oncomplete=r);db.close();return result;
  });
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
  await page.evaluate(async()=>{const commands=window.TradeFlowPilot.commands,plan=await commands.prepare('open settings');const outcome=await commands.execute(plan.id);if(outcome.status!=='succeeded')throw Error('Settings navigation failed')});
  await page.locator('[data-action="settingsPanel"][data-panel="backup"]').click();
  const dialogSeen=page.waitForEvent('dialog',{timeout:10000});
  await page.locator('#restoreFile').setInputFiles({name:'recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.getByText('Backup restored. Previous records are available as a recovery backup.',{exact:true}).waitFor();
  await page.waitForFunction(async()=>{const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result)),tx=db.transaction('customers'),r=tx.objectStore('customers').get('recovery-customer');const row=await new Promise(resolve=>r.onsuccess=()=>resolve(r.result));db.close();return row?.name==='Before edit'});
  await dialogSeen;
  assert.ok(dialogs.some(d=>d.type==='confirm'&&d.message.includes('Restore preview')),JSON.stringify(dialogs));
  assert.ok(!dialogs.some(d=>d.type==='alert'&&d.message.includes('failed')));
  await page.reload();
  const result=await page.evaluate(async()=>{
   const old=await window.TradeFlowLocalRecovery.latestRecovery(indexedDB),q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result));
   const now=await window.TradeFlowLocalRecovery.createBackup(db,[...db.objectStoreNames]);db.close();return {old,now};
  });
  assert.equal(result.old.stores.customers[0].name,'After edit');assert.equal(result.now.stores.customers[0].name,'Before edit');
  assert.equal(result.now.stores.payments[0].jobId,'recovery-job');assert.equal(result.now.version,9);
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.TradeFlowLocalRecovery&&!!window.TradeFlowPilot);
  await page.screenshot({path:path.join(out,'offline-'+viewport.width+'.png')});
  fs.writeFileSync(path.join(out,'result-'+viewport.width+'.json'),JSON.stringify({viewport,restored:true,recoverySurvivedReload:true,linkedRecordsPreserved:true,schema:9,offlineReload:true,dialogs},null,2));
  await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r))}
 console.log('PASS: mobile and desktop real UI restore, recovery after reload, linked records and offline reload');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
