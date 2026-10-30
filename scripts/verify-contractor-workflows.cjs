// Synthetic Chromium product scenarios, not contractor acceptance or provider outcomes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.OUTPUT_DIR||'artifacts/contractor-workflows';fs.mkdirSync(out,{recursive:true});
const root=path.resolve('public'),types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname,p=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!p.startsWith(root+'/')){res.writeHead(403);res.end();return}fs.readFile(p,(e,b)=>{if(e){res.writeHead(404);res.end();return}res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(b)})});
const customer={id:'c1',name:'Scenario customer',phone:'+15125550198'},job={id:'j1',title:'Scenario job',customerId:'c1',status:'In Progress'},invoice={id:'i1',customerId:'c1',status:'Issued',dueDate:'2026-10-01',currency:'USD',lines:[{qty:1,unitPrice:100}],taxRate:0};
const cases=[
 {id:'TF-P01',title:'Quotation follow-up review',data:{quotes:[{id:'q1',title:'Scenario quote',customerId:'c1',status:'Sent',sentDate:'2026-09-01'}]},resolved:{quotes:[{id:'q1',title:'Scenario quote',customerId:'c1',status:'Declined'}]}},
 {id:'TF-P02',title:'Overdue invoice',data:{invoices:[invoice],payments:[{id:'p1',invoiceId:'i1',customerId:'c1',currency:'USD',amount:30}]},resolved:{payments:[{id:'p1',invoiceId:'i1',customerId:'c1',currency:'USD',amount:100}]}},
 {id:'TF-P03',title:'Scheduling conflict',data:{jobs:[{...job,date:'2026-10-29',scheduleTime:'09:00',durationMinutes:60,assignedTo:'owner'},{...job,id:'j2',date:'2026-10-29',scheduleTime:'09:30',durationMinutes:60,assignedTo:'owner'}]},resolved:{jobs:[{...job,date:'2026-10-29',scheduleTime:'09:00',durationMinutes:60,assignedTo:'owner'},{...job,id:'j2',status:'Cancelled',date:'2026-10-29',scheduleTime:'09:30',durationMinutes:60,assignedTo:'owner'}]}},
 {id:'TF-P04',title:'Proposed extra work needs approval',data:{jobs:[{...job,changeOrders:[{id:'co1',description:'Synthetic additional work',amount:200,status:'proposed'}]}]},resolved:{jobs:[{...job,changeOrders:[{id:'co1',description:'Synthetic additional work',amount:200,status:'approved_recorded',approvalEvidence:'Synthetic fixture only, no real customer approval'}]}]}},
 {id:'TF-P05',title:'Job spending exceeds recorded budget',data:{jobs:[job],jobCosts:[{id:'e1',jobId:'j1',type:'estimate',amount:1000},{id:'a1',jobId:'j1',type:'actual',amount:1200}]},resolved:{jobCosts:[{id:'e1',jobId:'j1',type:'estimate',amount:1000},{id:'a1',jobId:'j1',type:'actual',amount:900}]}},
 {id:'TF-P06',title:'Recorded labor exceeds planned hours',data:{jobs:[job],jobCosts:[{id:'e1',jobId:'j1',category:'Labor',type:'estimate',laborHours:20,amount:800},{id:'a1',jobId:'j1',category:'Labor',type:'actual',laborHours:25,amount:1000}]},resolved:{jobCosts:[{id:'e1',jobId:'j1',category:'Labor',type:'estimate',laborHours:20,amount:800},{id:'a1',jobId:'j1',category:'Labor',type:'actual',laborHours:19,amount:760}]}},
 {id:'TF-P07',title:'Invoice payments need reconciliation',data:{invoices:[invoice],payments:[{id:'p1',invoiceId:'i1',customerId:'c1',currency:'USD',amount:150}]},resolved:{payments:[{id:'p1',invoiceId:'i1',customerId:'c1',currency:'USD',amount:100}]}},
 {id:'TF-P08',title:'Bid readiness needs review',data:{opportunities:[{id:'o1',project_name:'Scenario bid',status:'Interested',bid_decision:'Pursue',bidInvitationVerified:'Unknown',bidScopeReviewed:'Yes',bidCapacityChecked:'No'}]},resolved:{opportunities:[{id:'o1',project_name:'Scenario bid',status:'Interested',bid_decision:'Pursue',bidInvitationVerified:'Yes',bidScopeReviewed:'Yes',bidCapacityChecked:'Yes'}]}},
 {id:'TF-P09',data:{quotes:[{id:'q1',title:'Scenario source quote',category:'Electrical',customerId:'c1',status:'Accepted',amount:'1250',sentDate:'2026-09-01',signature:'NEVER COPY',approvedBy:'NEVER COPY'}]}},
 {id:'TF-P10',data:{jobs:[job],invoices:[{...invoice,lines:[{qty:1,unitPrice:1000}]}],payments:[{id:'p1',invoiceId:'i1',customerId:'c1',currency:'USD',amount:750}],jobCosts:[{id:'k1',jobId:'j1',type:'actual',amount:250}],expenses:[{id:'e1',jobId:'j1',amount:150}]}}
];
async function seed(page,data,clear){await page.evaluate(async({data,clear})=>{
 const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result)),stores=clear?[...db.objectStoreNames]:Object.keys(data),tx=db.transaction(stores,'readwrite');
 for(const store of stores){tx.objectStore(store).clear();for(const row of data[store]||[])tx.objectStore(store).put(row)}await new Promise(r=>tx.oncomplete=r);db.close();
},{data,clear})}
async function verifyQuoteFollowupJourney(page,result){
 const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept()});
 const snapshot=()=>page.evaluate(async()=>{
  const req=indexedDB.open('tradeflow-lite-v1',9);
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  const data=await window.TradeFlowLocalRecovery.readStores(db,['quotes','customers','tasks','events','commandLog']);
  db.close();return data;
 });
 await page.evaluate(()=>{
  window.__tfP01Trace=[];
  const existing=window.TradeFlowPilot,real=existing.commands;
  window.TradeFlowPilot={...existing,commands:new Proxy(real,{get(target,key){
   const fn=target[key];if(typeof fn!=='function'||!['prepare','approve','execute','reject','reconcile'].includes(key))return fn;
   return async function(...args){
    window.__tfP01Trace.push({step:String(key)+':begin',id:typeof args[0]==='string'?args[0]:undefined});
    try{
     const outcome=await fn.apply(target,args);
     window.__tfP01Trace.push({step:String(key)+':end',status:outcome?.status,
      code:outcome?.error?.code,message:outcome?.error?.message});
     return outcome;
    }catch(error){window.__tfP01Trace.push({step:String(key)+':error',message:String(error)});throw error}
   };
  }})};
 });
 const review=page.locator('[data-action="tfQuoteFollowupReview"][data-id="q1"]');
 await review.waitFor();await review.click();
 // Playwright click waits for dispatch, not completion of an async document listener.
 // Wait for the actual IndexedDB commit, not a guessed rendering delay.
 await page.waitForFunction(async()=>{
  const req=indexedDB.open('tradeflow-lite-v1',9);
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  try{
   const data=await window.TradeFlowLocalRecovery.readStores(db,['tasks']);
   return data.tasks.some(t=>t.quoteId==='q1'&&t.taskKind==='quotation_follow_up');
  }finally{db.close()}
 },null,{timeout:10000}).catch(()=>{});
 let state=await snapshot();
 const linked=state.tasks.filter(t=>t.quoteId==='q1'&&t.taskKind==='quotation_follow_up');
 if(linked.length!==1){
  const recent=state.commandLog.filter(x=>x.kind==='pilot.command'||x.kind==='quotation.followup.schedule')
   .map(x=>({id:x.id,kind:x.kind,commandId:x.commandId,status:x.status,
    error:x.error,lastEvent:x.events?.at(-1),result:x.result})).slice(-8);
  const visible=await page.locator('body').innerText();
  throw Error('Owner review did not persist one internal follow-up: '+
   JSON.stringify({count:linked.length,recent,dialogs,
    runtimeTrace:await page.evaluate(()=>window.__tfP01Trace||[]),
    visibleTail:visible.slice(-1200)}));
 }
 assert.equal(linked.length,1,'Owner review must create exactly one internal follow-up');
 assert.equal(linked[0].status,'Open');
 assert.equal(state.commandLog.filter(x=>x.kind==='quotation.followup.schedule').length,1);
 assert.ok(dialogs.some(x=>x.includes('does not contact the customer')));
 result.ownerApprovalCreatedTask=true;
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 await page.evaluate(async()=>{
  const commands=window.TradeFlowPilot.commands;
  const p=await commands.prepare({commandId:'record.open',params:{ref:{store:'quotes',id:'q1'}}});
  const out=await commands.execute(p.id);if(out.status!=='succeeded')throw Error('Cannot open quotation after reload');
 });
 await page.locator('[data-action="tfQuoteContactOutcome"][data-id="q1"]').click();
 const form=page.locator('#tfContactLogForm');await form.waitFor();
 assert.equal(await form.locator('[name="quoteId"]').inputValue(),'q1','Quote must be preselected');
 await form.locator('[name="method"]').selectOption('Phone');
 await form.locator('[name="outcome"]').selectOption('attempted');
 await form.locator('[name="notes"]').fill('Called and left no message; customer did not answer');
 await form.locator('button[type="submit"]').click();
 await page.getByText('Contact attempt recorded.',{exact:false}).waitFor();
 state=await snapshot();
 assert.equal(state.tasks.filter(t=>t.quoteId==='q1'&&t.status==='Open').length,1);
 assert.equal(state.events.filter(x=>x.quoteId==='q1'&&x.outcome==='attempted').length,1);
 assert.equal(state.quotes.find(x=>x.id==='q1').lastContactAt,undefined);
 await page.locator('#tfContactLogForm [name="quoteId"]').selectOption('q1');
 await page.locator('#tfContactLogForm [name="outcome"]').selectOption('reached');
 await page.locator('#tfContactLogForm [name="notes"]').fill('Spoke directly with the customer and confirmed the estimate discussion');
 await page.locator('#tfContactLogForm button[type="submit"]').click();
 await page.getByText('Owner-attested customer contact recorded',{exact:false}).waitFor();
 state=await snapshot();
 const task=state.tasks.find(x=>x.id===linked[0].id);
 const quote=state.quotes.find(x=>x.id==='q1');
 const reached=state.events.find(x=>x.quoteId==='q1'&&x.outcome==='reached');
 assert.equal(task.status,'Done');assert.equal(task.contactEventId,reached.id);
 assert.equal(quote.followupResolution.contactEventId,reached.id);
 assert.equal(quote.followupResolution.providerVerified,false);
 assert.equal(state.events.filter(x=>x.quoteId==='q1').length,2);
 assert.equal(state.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='task.completed').length,1);
 result.ownerAttestedResolutionPersisted=true;
 result.providerDeliveryVerified=false;
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 const persistent=await snapshot();
 assert.equal(persistent.tasks.find(x=>x.id===task.id).status,'Done');
 assert.equal(persistent.quotes.find(x=>x.id==='q1').followupResolution.contactEventId,reached.id);
 result.recoveryAfterReload=true;
 result.quoteNotificationMustNotBeClaimedResolvedByTaskOnly=true;
}
(async()=>{
 await new Promise(r=>server.listen(4193,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']}),results=[];
 try{for(const viewport of [{width:390,height:844},{width:1280,height:900}])for(const item of cases){
  const context=await browser.newContext({viewport,timezoneId:'America/Chicago'}),page=await context.newPage();page.setDefaultTimeout(10000);await page.clock.setFixedTime(new Date('2026-10-29T15:00:00Z'));
  const result={id:item.id,viewport,source:'isolated synthetic browser fixture',outcomeVerified:false};
  try{
   await page.goto('http://127.0.0.1:4193');await page.waitForFunction(()=>!!window.TradeFlowPilot);
   await seed(page,{customers:[customer],settings:[{id:'business',company:'Contractor scenario',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true}],...item.data},true);
   await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
   if(item.title){
    await page.locator('[data-notif-action="toggle"]').click();const notification=page.locator('.tf-notif-item').filter({hasText:item.title});await notification.waitFor();result.notificationShown=true;
    await page.screenshot({path:path.join(out,item.id+'-'+viewport.width+'.png')});await notification.click();result.navigationClicked=true;
    if(item.id==='TF-P01'){
     await verifyQuoteFollowupJourney(page,result);
     await page.locator('[data-notif-action="toggle"]').click();
     assert.equal(await page.locator('.tf-notif-item').filter({hasText:item.title}).count(),0);
     result.notificationCleared=true;
    }else{
     // Controlled record corrections validate resolution detection; not a claim of field authorization.
     await seed(page,item.resolved,false);await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);await page.locator('[data-notif-action="toggle"]').click();assert.equal(await page.locator('.tf-notif-item').filter({hasText:item.title}).count(),0);result.notificationCleared=true;
    }
   }else{
    await page.evaluate(async type=>{const c=window.TradeFlowPilot.commands,p=await c.prepare({commandId:'record.open',params:{ref:{store:type,id:type==='quotes'?'q1':'c1'}}});const r=await c.execute(p.id);if(r.status!=='succeeded')throw Error('Record navigation failed')},item.id==='TF-P09'?'quotes':'customers');
    if(item.id==='TF-P09'){
     await page.locator('[data-action="tfQuoteReuse"]').click();const form=page.locator('#recordForm');await form.waitFor();assert.equal(await form.locator('[name="customerId"]').inputValue(),'');assert.equal(await form.locator('[name="status"]').inputValue(),'Draft');
     await form.locator('[name="customerId"]').selectOption('c1');await form.locator('[type="submit"]').click();await page.getByText('Record saved',{exact:true}).waitFor();
     const check=await page.evaluate(async()=>{const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result)),rows=await window.TradeFlowLocalRecovery.readStores(db,['quotes','commandLog']);db.close();return rows});
     assert.equal(check.quotes.length,2);const draft=check.quotes.find(q=>q.id!=='q1');assert.equal(draft.status,'Draft');assert.equal(draft.sentDate,'');assert.equal(draft.signature,undefined);assert.equal(draft.approvedBy,undefined);
     assert.ok(check.commandLog.some(r=>r.kind==='domain.event'&&r.ref.id===draft.id&&r.status==='processed'));result.safeDraftPersisted=true;result.transactionalReviewProcessed=true;
    }else{
     const box=page.locator('.tf-record-dossier-box').filter({hasText:'Recorded customer economics'});await box.waitFor();const text=await box.innerText();for(const value of ['$750.00','$400.00','$350.00','not verified bank receipts'])assert.ok(text.includes(value));result.recordedEconomicsRendered=true;
    }
    await page.screenshot({path:path.join(out,item.id+'-'+viewport.width+'.png')});
   }
   result.status='pass';
  }catch(error){result.status='fail';result.error=error.message;await page.screenshot({path:path.join(out,item.id+'-'+viewport.width+'-failure.png')}).catch(()=>{})}
  finally{results.push(result);await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({commit:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),kind:'synthetic-browser-product-check',dirty:!!cp.execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),results,painPointsRetired:0},null,2))}
 }}finally{await browser.close();await new Promise(r=>server.close(r))}
 const failed=results.filter(r=>r.status==='fail');for(const row of failed)console.error(row.id+' '+row.viewport.width+': '+row.error);console.log(results.length-failed.length+'/'+results.length+' Chromium workflow scenarios passed; contractor outcomes unverified.');if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
