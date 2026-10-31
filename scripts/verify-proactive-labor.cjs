// H04-PRO-01 synthetic mobile/desktop proactive TF-P06 journey.
// Actual IndexedDB, registered domain-event review and shared command engine.
// No live provider, Cloudflare D1, customer data or verified payroll.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve('public'),out='artifacts/proactive-labor';
fs.mkdirSync(out,{recursive:true});
const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+'/')){res.writeHead(403);return res.end()}
 fs.readFile(file,(error,bytes)=>{
  if(error){res.writeHead(404);return res.end()}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(bytes)
 });
});
const read=page=>page.evaluate(async()=>{
 const req=indexedDB.open('tradeflow-lite-v1',9);
 const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
 try{return await window.TradeFlowLocalRecovery.readStores(db,['commandLog','tasks','jobCosts'])}
 finally{db.close()}
});
async function seed(page){
 await page.evaluate(async()=>{
  const req=indexedDB.open('tradeflow-lite-v1',9);
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  const tx=db.transaction([...db.objectStoreNames],'readwrite');
  for(const name of db.objectStoreNames)tx.objectStore(name).clear();
  for(const [name,items] of Object.entries({
   settings:[{id:'business',company:'Proactive fixture',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true}],
   customers:[{id:'c1',name:'Synthetic customer',businessId:'local-business',phone:'+15125550111'}],
   jobs:[{id:'j1',title:'Synthetic distribution panel',customerId:'c1',status:'In Progress',businessId:'local-business'}],
   jobCosts:[{id:'planned',jobId:'j1',category:'Labor',type:'estimate',laborHours:20,amount:800,businessId:'local-business'}]
  }))for(const row of items)tx.objectStore(name).put(row);
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
  db.close();
 });
}
async function writeActual(page){
 await page.evaluate(async()=>{
  const req=indexedDB.open('tradeflow-lite-v1',9);
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  try{
   await window.TradeFlowBusinessEvents.write(db,'jobCosts',{
    id:'actual',jobId:'j1',category:'Labor',type:'actual',laborHours:25,amount:1000,businessId:'local-business'
   },{actor:'local-owner',businessId:'local-business'});
  }finally{db.close()}
 });
}
async function openJob(page){
 const toggle=page.locator('[data-notif-action="toggle"]');
 if(await toggle.count())await toggle.click();
 const notification=page.locator('.tf-notif-item').filter({hasText:'Recorded labor exceeds planned hours'});
 await notification.waitFor();
 await notification.click();
 const open=page.locator('[data-action="tfDecisionExplain"][data-id="j1"]');
 await open.waitFor();
}
async function verify(viewport){
 const browser=await chromium.launch({args:['--no-sandbox']});
 const context=await browser.newContext({viewport,timezoneId:'America/Chicago'});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const result={viewport,synthetic:true,physicalDeviceAccepted:false,outcomeVerified:false,stage:'initialization'};
 try{
  await page.clock.setFixedTime(new Date('2026-10-31T15:00:00Z'));
  await page.goto('http://127.0.0.1:4196');
  await page.waitForFunction(()=>!!window.TradeFlowPilot);
  await seed(page);
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
  result.stage='record manual labor entry via existing event-aware data writer';
  await writeActual(page);
  assert.equal((await read(page)).tasks.length,0,'automatic detection must not create business tasks');
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
  // Read the actual committed IndexedDB journal through the same recovery
  // port used by the application. Poll boundedly; a waitForFunction JSHandle
  // does not constitute a durable readback or an authoritative persisted row.
  let first,event;
  const deadline=Date.now()+15000;
  do{
   first=await read(page);
   event=first.commandLog.find(x=>x.kind==='domain.event'&&x.status==='processed'&&
    x.result?.laborFindings?.some(y=>y.jobId==='j1'&&y.varianceHours===5));
   if(event)break;
   await new Promise(resolve=>setTimeout(resolve,100));
  }while(Date.now()<deadline);
  assert.ok(event,'Persisted event missing: '+JSON.stringify((first?.commandLog||[]).map(x=>({
   kind:x.kind,status:x.status,result:x.result,ref:x.ref
  }))).slice(0,2300));
  assert.equal(event.result.laborFindings.find(y=>y.jobId==='j1').varianceHours,5);
  assert.equal(first.tasks.length,0);
  result.persistedFinding=true;
  result.stage='job dossier shows persisted observation and decision alternatives';
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
  await openJob(page);
  const attention=page.locator('[data-proactive-labor-finding="j1"]');
  await attention.waitFor();
  assert.match(await attention.innerText(),/Estimated 20 h/);
  assert.match(await attention.innerText(),/manually recorded 25 h/);
  assert.match(await attention.innerText(),/not verified timesheets or payroll/i);
  await page.screenshot({path:path.join(out,'proactive-labor-'+viewport.width+'-finding.png')});
  await page.locator('[data-action="tfDecisionExplain"][data-id="j1"]').click();
  await page.getByText('Possible explanations',{exact:true}).waitFor();
  await page.getByText('Take no action',{exact:true}).waitFor();
  result.stage='no-action choice cannot write task';
  await page.getByText('Take no action',{exact:true}).click();
  assert.equal((await read(page)).tasks.length,0);
  result.noActionSafe=true;
  result.stage='existing explicit approval and saved receipt';
  const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept()});
  const review=page.locator('[data-decision-action="review"]').filter({hasText:'Prepare internal labor review'});
  await review.waitFor();await review.click();
  await page.locator('[data-decision-receipt]').waitFor();
  const state=await read(page),tasks=state.tasks.filter(x=>x.taskKind==='job_labor_variance_review');
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].laborEvidence.timesheetVerified,false);
  assert.equal(tasks[0].laborEvidence.payrollVerified,false);
  assert.ok(state.commandLog.some(x=>x.kind==='pilot.command'&&x.commandId==='job.labor_review.schedule'&&x.status==='succeeded'));
  assert.ok(dialogs.some(x=>/payroll remain unverified/i.test(x)));
  result.ownerApprovalAndReceiptVerified=true;
  await page.screenshot({path:path.join(out,'proactive-labor-'+viewport.width+'-receipt.png')});
  result.stage='reload must retain one task and journal evidence';
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
  const recovered=await read(page);
  assert.equal(recovered.tasks.filter(x=>x.taskKind==='job_labor_variance_review').length,1);
  assert.ok(recovered.commandLog.some(x=>x.kind==='domain.event'&&x.result?.laborFindings?.some(y=>y.jobId==='j1')));
  result.reloadRecovered=true;
  result.stage='replaced cost source with same aggregate hours must hide old attention';
  await page.evaluate(async()=>{
   const req=indexedDB.open('tradeflow-lite-v1',9);
   const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
   try{
    const tx=db.transaction('jobCosts','readwrite');
    const rows=tx.objectStore('jobCosts');
    rows.delete('actual');
    rows.put({id:'actual-replaced',jobId:'j1',category:'Labor',type:'actual',
     laborHours:25,amount:1000,businessId:'local-business'});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
   }finally{db.close()}
  });
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
  // Navigate through the same read-only command boundary as the existing UI.
  const nav=await page.evaluate(async()=>{
   const runtime=window.TradeFlowPilot.commands;
   const plan=await runtime.prepare({commandId:'record.open',params:{ref:{store:'jobs',id:'j1'}}});
   if(plan.status!=='ready')return plan;
   return runtime.execute(plan.id);
  });
  assert.equal(nav.status,'succeeded','read-only record navigation must succeed');
  await page.locator('[data-action="tfDecisionExplain"][data-id="j1"]').waitFor();
  assert.equal(await page.locator('[data-proactive-labor-finding="j1"]').count(),0,
   'replaced underlying record with equal total hours cannot reuse stale source observation');
  const stale=await read(page);
  assert.equal(stale.tasks.filter(x=>x.taskKind==='job_labor_variance_review').length,1,
   'stale display suppression cannot replay or delete an approved task');
  assert.ok(stale.commandLog.some(x=>x.kind==='domain.event'&&
   x.result?.laborFindings?.some(y=>y.jobId==='j1')),
   'older audit observation should remain stored for inspection');
  result.sameTotalStaleSourceSuppressed=true;
  await page.screenshot({path:path.join(out,'proactive-labor-'+viewport.width+'-stale-source.png')});
  result.status='pass';
  return result;
 }catch(error){
  result.status='fail';result.error=result.stage+': '+error.message;
  await page.screenshot({path:path.join(out,'proactive-labor-'+viewport.width+'-failure.png')}).catch(()=>{});
  return result;
 }finally{await context.close();await browser.close()}
}
(async()=>{
 await new Promise(resolve=>server.listen(4196,'127.0.0.1',resolve));
 let results=[];
 try{for(const viewport of [{width:390,height:844},{width:1280,height:900}])results.push(await verify(viewport))}
 finally{await new Promise(resolve=>server.close(resolve))}
 const sha=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({sha,dirty:!!cp.execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),source:'local IndexedDB plus existing shared command engine',results},null,2));
 const failures=results.filter(x=>x.status!=='pass');
 for(const f of failures)console.error(f.viewport.width+' '+f.error);
 console.log((results.length-failures.length)+'/'+results.length+' Chromium proactive labor journeys passed; no real contractor outcome');
 if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
