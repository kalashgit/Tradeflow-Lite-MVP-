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
  // Simulate the narrow crash window after the core transaction committed its
  // receipt and task, but before the outer command ledger finalized success.
  // This is test-only IndexedDB fault injection; reconciliation must never
  // replay the already committed business operation.
  result.stage='interrupted command finalization reconciles receipt without replay';
  const interrupted=await page.evaluate(async()=>{
   const q=indexedDB.open('tradeflow-lite-v1',9);
   const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   try{
    const tx=db.transaction('commandLog','readwrite'),store=tx.objectStore('commandLog');
    const rows=await new Promise((resolve,reject)=>{
     const request=store.getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const completed=rows.filter(x=>x.kind==='pilot.command'&&x.commandId==='job.labor_review.schedule'&&x.status==='succeeded');
    if(completed.length!==1)throw Error('Expected one completed approved labor command');
    const command=completed[0],receiptId='job-labor-review:operation:'+command.id;
    if(rows.filter(x=>x.id===receiptId&&x.kind==='job.labor_review.schedule').length!==1)
     throw Error('Committed core receipt missing before injected finalization loss');
    const pending={...command,status:'executing',events:command.events.filter(x=>x.type!=='succeeded')};
    delete pending.outcome;
    store.put(pending);
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
    return {id:command.id,receiptId};
   }finally{db.close()}
  });
  const reconciled=await page.evaluate(id=>window.TradeFlowPilot.commands.reconcile(id),interrupted.id);
  assert.equal(reconciled.status,'succeeded','interrupted command must reconcile an existing durable receipt');
  assert.equal(reconciled.result?.reconciled,true,'recovery must be receipt-backed, not a fresh execution');
  const replay=await page.evaluate(id=>window.TradeFlowPilot.commands.execute(id),interrupted.id);
  assert.equal(replay.status,'succeeded');
  assert.equal(replay.reused,true,'executing a reconciled command must reuse the receipt');
  const recoveryState=await read(page);
  assert.equal(recoveryState.tasks.filter(x=>x.taskKind==='job_labor_variance_review').length,1);
  assert.equal(recoveryState.commandLog.filter(x=>x.id===interrupted.receiptId).length,1);
  assert.equal(recoveryState.commandLog.filter(x=>x.kind==='domain.event'&&
   x.type==='task.created'&&x.correlationId===interrupted.receiptId).length,1);
  result.interruptedReceiptReconciledNoReplay=true;
  await page.screenshot({path:path.join(out,'proactive-labor-'+viewport.width+'-reconciled.png')});
  result.stage='explicit rejection cannot create another labor task';
  const rejected=await page.evaluate(async()=>{
   const runtime=window.TradeFlowPilot.commands;
   const plan=await runtime.prepare({commandId:'job.labor_review.schedule',
    params:{ref:{store:'jobs',id:'j1'},due:'2026-11-01'}});
   if(plan.status!=='needs_review')return {prepared:plan.status,error:plan.error};
   const refusal=await runtime.reject(plan.id);
   return {prepared:plan.status,rejected:refusal.status};
  });
  assert.equal(rejected.prepared,'needs_review',JSON.stringify(rejected));
  assert.equal(rejected.rejected,'rejected','explicit rejection must be recorded');
  assert.equal((await read(page)).tasks.filter(x=>x.taskKind==='job_labor_variance_review').length,1);
  result.explicitRejectionNoWrite=true;
  result.stage='revoked command capability before approval and execution fails closed';
  // Test-only revocable authorization port, backed by the same real shared
  // command runtime, IndexedDB command ledger and existing saved records.
  // No production permission grant or alternate business executor is added.
  const revoked=await page.evaluate(async()=>{
   const q=indexedDB.open('tradeflow-lite-v1',9);
   const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   try{
    let allowed=true,operationCalls=0;
    const runtime=window.TradeFlowCommands.createRuntime({
     snapshot:()=>window.TradeFlowLocalRecovery.readStores(db,[...db.objectStoreNames]),
     context:()=>({actor:'local-owner',businessId:'local-business',today:'2026-10-31'}),
     uid:()=>crypto.randomUUID(),
     ledger:window.TradeFlowCommands.createLedger(()=>db),
     can:(permission,context)=>allowed&&permission==='modify:job.labor_review.schedule'&&
      context.actor==='local-owner'&&context.businessId==='local-business',
     ports:{operation:async()=>{operationCalls++;throw Error('Revoked command reached business executor')}}
    });
    const plan=await runtime.prepare({commandId:'job.labor_review.schedule',
     params:{ref:{store:'jobs',id:'j1'},due:'2026-11-02'}});
    allowed=false;
    const deniedApproval=await runtime.approve(plan.id);
    allowed=true;
    const approved=await runtime.approve(plan.id);
    allowed=false;
    const deniedExecution=await runtime.execute(plan.id);
    const saved=await runtime.get(plan.id);
    return {prepared:plan.status,deniedApproval:deniedApproval.status,
     approved:approved.status,deniedExecution:deniedExecution.status,
     savedStatus:saved?.status,operationCalls};
   }finally{db.close()}
  });
  assert.equal(revoked.prepared,'needs_review',JSON.stringify(revoked));
  assert.equal(revoked.deniedApproval,'denied');
  assert.equal(revoked.approved,'approved');
  assert.equal(revoked.deniedExecution,'denied');
  assert.equal(revoked.savedStatus,'approved','revocation must not falsely finalize the command');
  assert.equal(revoked.operationCalls,0,'revoked command must never enter the business operation');
  assert.equal((await read(page)).tasks.filter(x=>x.taskKind==='job_labor_variance_review').length,1);
  result.revokedCapabilityDeniedBeforeExecution=true;
  await page.screenshot({path:path.join(out,'proactive-labor-'+viewport.width+'-revoked.png')});
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
  const reopen=async()=>{
   await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
   const nav=await page.evaluate(async()=>{
    const commands=window.TradeFlowPilot.commands;
    const plan=await commands.prepare({commandId:'record.open',params:{ref:{store:'jobs',id:'j1'}}});
    return plan.status==='ready'?commands.execute(plan.id):plan;
   });
   assert.equal(nav.status,'succeeded');
   await page.locator('[data-action="tfDecisionExplain"][data-id="j1"]').waitFor();
  };
  result.stage='foreign-tenant cost source cannot revive saved labor observation';
  await page.evaluate(async()=>{
   const q=indexedDB.open('tradeflow-lite-v1',9);
   const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   try{
    const tx=db.transaction('jobCosts','readwrite');
    tx.objectStore('jobCosts').put({id:'actual-replaced',jobId:'j1',category:'Labor',type:'actual',
     laborHours:25,amount:1000,businessId:'foreign-business'});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
   }finally{db.close()}
  });
  await reopen();
  assert.equal(await page.locator('[data-proactive-labor-finding="j1"]').count(),0);
  assert.equal((await read(page)).tasks.filter(x=>x.taskKind==='job_labor_variance_review').length,1);
  result.foreignSourceSuppressed=true;
  result.stage='missing planned cost source cannot revive saved labor observation';
  await page.evaluate(async()=>{
   const q=indexedDB.open('tradeflow-lite-v1',9);
   const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   try{
    const tx=db.transaction('jobCosts','readwrite');tx.objectStore('jobCosts').delete('planned');
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
   }finally{db.close()}
  });
  await reopen();
  assert.equal(await page.locator('[data-proactive-labor-finding="j1"]').count(),0);
  result.missingSourceSuppressed=true;
  result.stage='disabled automatic review never processes new event or executes extra task';
  await page.evaluate(async()=>{
   const q=indexedDB.open('tradeflow-lite-v1',9);
   const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   try{
    const tx=db.transaction('settings','readwrite');
    tx.objectStore('settings').put({id:'automation.rules',operationalReviewEnabled:false});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
    await window.TradeFlowBusinessEvents.write(db,'jobCosts',{
     id:'disabled-actual',jobId:'j1',category:'Labor',type:'actual',laborHours:27,
     amount:1080,businessId:'local-business'
    },{actor:'local-owner',businessId:'local-business'});
   }finally{db.close()}
  });
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
  const disabled=await read(page);
  assert.ok(disabled.commandLog.some(x=>x.kind==='domain.event'&&x.ref?.id==='disabled-actual'&&x.status==='pending'),
   'disabled automatic review must leave the new event pending, not processed');
  assert.equal(disabled.tasks.filter(x=>x.taskKind==='job_labor_variance_review').length,1,
   'disabled automatic review cannot create another task');
  result.disabledRulePreventsReview=true;
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
