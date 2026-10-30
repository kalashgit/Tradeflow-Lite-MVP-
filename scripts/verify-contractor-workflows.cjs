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
 {id:'TF-P03',title:'Scheduling conflict',data:{calendarEntries:[
  {id:'event-a',title:'Synthetic site visit A',date:'2026-11-05',time:'09:00',durationMinutes:60,assignedTo:'owner',status:'Scheduled',businessId:'local-business'},
  {id:'event-b',title:'Synthetic site visit B',date:'2026-11-05',time:'09:30',durationMinutes:60,assignedTo:'owner',status:'Scheduled',businessId:'local-business'}
 ]}},
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
async function verifyInvoiceFollowupJourney(page,result){
 const decisions=[];
 page.on('dialog',async dialog=>{
  decisions.push(dialog.message());
  await dialog.accept();
 });
 const button=page.locator('[data-revenue-action="followup"][data-id="i1"]');
 await button.waitFor({timeout:15000});
 await button.click();
 await page.waitForFunction(async()=>{
  const q=indexedDB.open('tradeflow-lite-v1',9);
  const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  try{
   const d=await window.TradeFlowLocalRecovery.readStores(db,['tasks','commandLog']);
   return d.tasks.some(t=>t.invoiceId==='i1'&&t.status==='Open')&&
    d.commandLog.some(c=>c.kind==='pilot.command'&&c.commandId==='invoice.followup.schedule'&&c.status==='succeeded');
  }finally{db.close()}
 },null,{timeout:15000});
 const evidence=await page.evaluate(async()=>{
  const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result));
  const d=await window.TradeFlowLocalRecovery.readStores(db,['tasks','commandLog']);db.close();return d;
 });
 const tasks=evidence.tasks.filter(t=>t.invoiceId==='i1');
 assert.equal(tasks.length,1,'Invoice dossier task count mismatch: '+JSON.stringify({tasks:evidence.tasks,receipts:evidence.commandLog.filter(c=>c.kind==='invoice.followup.schedule'),commands:evidence.commandLog.filter(c=>c.kind==='pilot.command'&&c.commandId==='invoice.followup.schedule'),decisions}));
 assert.equal(tasks[0].status,'Open');
 assert.equal(tasks[0].customerId,'c1');
 assert.equal(evidence.commandLog.filter(c=>c.kind==='invoice.followup.schedule').length,1,'Invoice core receipt missing: '+JSON.stringify({tasks:evidence.tasks,receipts:evidence.commandLog.filter(c=>String(c.kind).includes('invoice')),commands:evidence.commandLog.filter(c=>c.kind==='pilot.command')}));
 assert.ok(decisions.some(m=>m.includes('No email or payment request will be sent')));
 result.invoiceOwnerReviewedTask=true;
 result.externalInvoiceMessageSent=false;
 await page.reload();
 await page.waitForFunction(()=>!!window.TradeFlowPilot);
 const after=await page.evaluate(async()=>{
  const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result));
  const d=await window.TradeFlowLocalRecovery.readStores(db,['tasks','commandLog']);db.close();return d;
 });
 assert.equal(after.tasks.filter(t=>t.invoiceId==='i1').length,1,'Invoice task missing after reload: '+JSON.stringify({tasks:after.tasks,receipts:after.commandLog.filter(c=>c.kind==='invoice.followup.schedule')}));
 assert.ok(after.commandLog.some(c=>c.kind==='invoice.followup.schedule'));
 result.invoiceReloadPersistence=true;
}
async function verifyChangeOrderReviewJourney(page,result){
 result.stage='change order: open reviewed action';
 const dialogs=[];
 page.on('dialog',async dialog=>{dialogs.push(dialog.message());
  await (dialog.type()==='prompt'?dialog.accept('Signed customer change authorization #TF-042'):dialog.accept());
 });
 const button=page.locator('[data-action="tfChangeOrderReview"][data-id="j1"][data-change-id="co1"]');
 await button.waitFor({timeout:15000});
 await button.click();
 const read=()=>page.evaluate(async()=>{
  const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result));
  const data=await window.TradeFlowLocalRecovery.readStores(db,['jobs','tasks','commandLog']);db.close();return data;
 });
 await page.waitForFunction(async()=>{
  const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result));
  const d=await window.TradeFlowLocalRecovery.readStores(db,['tasks','commandLog']);db.close();
  return d.tasks.some(t=>t.changeOrderId==='co1')&&d.commandLog.some(x=>x.commandId==='job.change_order.review.schedule'&&x.status==='succeeded');
 },null,{timeout:15000});
 await page.getByText('Internal authorization-review task verified.',{exact:false}).waitFor({timeout:15000});
 result.stage='change order: verify first commit';
 let data=await read();const tasks=data.tasks.filter(x=>x.changeOrderId==='co1');
 assert.equal(tasks.length,1,'Task persistence: '+JSON.stringify(data.tasks));assert.equal(tasks[0].customerAuthorizationStatus,'unverified');
 assert.equal(data.jobs[0].changeOrders[0].status,'proposed');
 assert.equal(data.commandLog.filter(x=>x.kind==='job.change_order.review.schedule').length,1,'Core receipts: '+JSON.stringify(data.commandLog.filter(x=>x.kind!=='domain.event')));
 assert.ok(dialogs.some(x=>x.includes('does not authorize the extra work')));
 result.internalOwnerReviewCreatedTask=true;
 result.stage='change order: verify reload';
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 data=await read();assert.equal(data.tasks.filter(x=>x.changeOrderId==='co1').length,1);
 result.reloadPreservedReview=true;
 result.stage='change order: reopen and reject duplicate';
 await page.locator('[data-notif-action="toggle"]').click();
 await page.locator('.tf-notif-item').filter({hasText:'Proposed extra work needs approval'}).click();
 await button.click();
 data=await read();assert.equal(data.tasks.filter(x=>x.changeOrderId==='co1').length,1,'Duplicate task state: '+JSON.stringify(data.tasks));
 result.duplicateReviewReusedTask=true;
 result.stage='change order: record separately attested customer evidence';
 const approve=page.locator('[data-tf-change-action="approve"][data-job="j1"][data-id="co1"]');
 await approve.waitFor();await approve.click();
 await page.getByText('Owner-attested customer approval reference recorded.',{exact:false}).waitFor({timeout:15000});
 data=await read();
 assert.equal(data.jobs[0].changeOrders[0].status,'approved_recorded');
 assert.equal(data.jobs[0].changeOrders[0].customerAuthorization.providerVerified,false);
 assert.equal(data.tasks.filter(t=>t.changeOrderId==='co1'&&t.status==='Done').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='job.change_order.authorization.record').length,1);
 assert.ok(dialogs.some(x=>x.includes('OWNER ATTESTATION')));
 result.customerEvidenceOwnerAttestedAndAudited=true;
 result.stage='change order: reload recorded authorization';
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 data=await read();
 assert.equal(data.tasks.filter(t=>t.changeOrderId==='co1'&&t.status==='Done').length,1);
 result.ownerAttestationSurvivedReload=true;
}
async function verifyJobCostReviewJourney(page,result){
 result.stage='job cost review: owner confirmation';
 const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept()});
 const button=page.locator('[data-action="tfJobCostReview"][data-id="j1"]');
 await button.waitFor({timeout:15000});await button.click();
 await page.getByText('Internal job-cost reconciliation task saved.',{exact:false}).waitFor({timeout:15000});
 const read=()=>page.evaluate(async()=>{
  const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result));
  const data=await window.TradeFlowLocalRecovery.readStores(db,['tasks','commandLog']);db.close();return data;
 });
 result.stage='job cost review: persisted evidence';
 let data=await read(),tasks=data.tasks.filter(t=>t.taskKind==='job_cost_reconciliation');
 assert.equal(tasks.length,1);assert.equal(tasks[0].financialEvidence.budget,1000);
 assert.equal(tasks[0].financialEvidence.recordedCosts,1200);
 assert.equal(tasks[0].financialEvidence.profitVerified,false);
 assert.equal(tasks[0].financialEvidence.externalAccountingVerified,false);
 assert.equal(data.commandLog.filter(x=>x.kind==='job.cost_review.schedule').length,1);
 assert.ok(dialogs.some(x=>x.includes('NOT verified profit')));
 result.ownerApprovedRecordedCostReview=true;
 result.stage='job cost review: reload';
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 data=await read();assert.equal(data.tasks.filter(t=>t.taskKind==='job_cost_reconciliation').length,1);
 result.reviewPersistedAfterReload=true;
}
async function verifyJobLaborReviewJourney(page,result){
 result.stage='labor variance: owner approval';
 const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept()});
 const button=page.locator('[data-action="tfJobLaborReview"][data-id="j1"]');
 await button.waitFor({timeout:15000});await button.click();
 await page.getByText('Internal labor-hour variance review saved.',{exact:false}).waitFor({timeout:15000});
 const read=()=>page.evaluate(async()=>{
  const req=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>req.onsuccess=()=>r(req.result));
  const data=await window.TradeFlowLocalRecovery.readStores(db,['tasks','commandLog']);db.close();return data;
 });
 result.stage='labor variance: persisted evidence';
 let data=await read(),tasks=data.tasks.filter(t=>t.taskKind==='job_labor_variance_review');
 assert.equal(tasks.length,1);assert.equal(tasks[0].laborEvidence.estimatedLaborHours,20);
 assert.equal(tasks[0].laborEvidence.recordedLaborHours,25);
 assert.equal(tasks[0].laborEvidence.timesheetVerified,false);
 assert.equal(tasks[0].laborEvidence.payrollVerified,false);
 assert.equal(data.commandLog.filter(x=>x.kind==='job.labor_review.schedule').length,1);
 assert.ok(dialogs.some(x=>x.includes('NOT verified timesheets')));
 result.ownerApprovedManualLaborReview=true;
 result.stage='labor variance: reload';
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 data=await read();assert.equal(data.tasks.filter(t=>t.taskKind==='job_labor_variance_review').length,1);
 result.laborReviewPersistedAfterReload=true;
}
async function verifyInvoicePaymentReviewJourney(page,result){
 result.stage='payment discrepancy: owner approval';
 const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept()});
 const button=page.locator('[data-action="tfInvoicePaymentReview"][data-id="i1"]');
 await button.waitFor({timeout:15000});await button.click();
 await page.getByText('Internal invoice payment reconciliation task saved.',{exact:false}).waitFor({timeout:15000});
 const read=()=>page.evaluate(async()=>{
  const req=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>req.onsuccess=()=>r(req.result));
  const data=await window.TradeFlowLocalRecovery.readStores(db,['tasks','payments','commandLog']);db.close();return data;
 });
 result.stage='payment discrepancy: persisted evidence';
 let data=await read(),tasks=data.tasks.filter(t=>t.taskKind==='invoice_payment_reconciliation');
 assert.equal(tasks.length,1);assert.equal(tasks[0].paymentEvidence.invoiceTotal,100);
 assert.equal(tasks[0].paymentEvidence.recordedPayments,150);
 assert.equal(tasks[0].paymentEvidence.externalAccountingVerified,false);
 assert.equal(tasks[0].paymentEvidence.settlementVerified,false);
 assert.equal(data.payments.find(p=>p.id==='p1').amount,150);
 assert.equal(data.commandLog.filter(x=>x.kind==='invoice.payment_review.schedule').length,1);
 assert.ok(dialogs.some(x=>x.includes('NOT verified bank settlements')));
 result.ownerApprovedPaymentReview=true;
 result.stage='payment discrepancy: reload';
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 data=await read();assert.equal(data.tasks.filter(t=>t.taskKind==='invoice_payment_reconciliation').length,1);
 result.paymentReviewPersistedAfterReload=true;
}
async function verifyQuoteFollowupJourney(page,result){
 const dialogs=[],browserErrors=[];
 page.on('pageerror',error=>browserErrors.push('pageerror: '+error.message));
 page.on('console',message=>{if(message.type()==='error')browserErrors.push('console: '+message.text())});

 const snapshot=()=>page.evaluate(async()=>{
  const req=indexedDB.open('tradeflow-lite-v1',9);
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  const data=await window.TradeFlowLocalRecovery.readStores(db,['quotes','customers','tasks','events','commandLog']);
  db.close();return data;
 });
 await page.evaluate(()=>{
  window.__tfP01Trace=[];
  const old=window.TradeFlowPilot,real=old.commands,wrapped={...real};
  for(const key of ['prepare','approve','execute','reject','reconcile']){
   const fn=real[key];if(typeof fn!=='function')continue;
   wrapped[key]=async(...args)=>{
    window.__tfP01Trace.push({method:key,phase:'start',id:typeof args[0]==='string'?args[0]:undefined});
    try{const result=await fn(...args);
     window.__tfP01Trace.push({method:key,phase:'result',status:result?.status,
      code:result?.error?.code,message:result?.error?.message});
     return result
    }catch(error){
     window.__tfP01Trace.push({method:key,phase:'throw',error:String(error)});throw error;
    }
   };
  }
  window.TradeFlowPilot={...old,commands:wrapped};
 });
 result.stage='owner-reviewed quotation follow-up';
 const review=page.locator('[data-action="tfQuoteFollowupReview"][data-id="q1"]');
 await review.waitFor();
 const ownerConfirmation=page.waitForEvent('dialog',{timeout:15000}).then(async dialog=>{
  dialogs.push(dialog.message());await dialog.accept();
 });
 await review.click();
 await ownerConfirmation;
 // Wait on the existing completion notification without opening competing
 // IndexedDB read transactions while the command's write transaction is active.
 await page.getByText('Follow-up task saved.',{exact:false})
  .waitFor({timeout:20000}).catch(()=>{});
 let state=await snapshot();
 const linked=state.tasks.filter(t=>t.quoteId==='q1'&&t.taskKind==='quotation_follow_up');
 if(linked.length!==1){
  const recent=state.commandLog.filter(x=>x.kind==='pilot.command'||x.kind==='quotation.followup.schedule')
   .map(x=>({id:x.id,kind:x.kind,commandId:x.commandId,status:x.status,
    error:x.error,lastEvent:x.events?.at(-1),result:x.result})).slice(-8);
  const visible=await page.locator('body').innerText();
  throw Error('Owner review did not persist one internal follow-up: '+
   JSON.stringify({count:linked.length,recent,dialogs,browserErrors,trace:await page.evaluate(()=>window.__tfP01Trace||[]),
    
    visibleTail:visible.slice(-1200)}));
 }
 assert.equal(linked.length,1,'Owner review must create exactly one internal follow-up');
 assert.equal(linked[0].status,'Open');
 assert.equal(state.commandLog.filter(x=>x.kind==='quotation.followup.schedule').length,1);
 assert.ok(dialogs.some(x=>x.includes('does not contact the customer')));
 result.ownerApprovalCreatedTask=true;
 result.stage='reload and reopen quotation';
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 await page.evaluate(async()=>{
  const commands=window.TradeFlowPilot.commands;
  const p=await commands.prepare({commandId:'record.open',params:{ref:{store:'quotes',id:'q1'}}});
  const out=await commands.execute(p.id);if(out.status!=='succeeded')throw Error('Cannot open quotation after reload');
 });
 result.stage='open linked customer contact form';
 await page.locator('[data-action="tfQuoteContactOutcome"][data-id="q1"]').click();
 const form=page.locator('#tfContactLogForm');await form.waitFor();
 assert.equal(await form.locator('[name="quoteId"]').inputValue(),'q1','Quote must be preselected');
 result.stage='save attempted customer contact';
 await form.locator('[name="method"]').selectOption('Phone');
 await form.locator('[name="outcome"]').selectOption('attempted');
 await form.locator('[name="notes"]').fill('Called and left no message; customer did not answer');
 const attemptedApproval=page.waitForEvent('dialog',{timeout:15000}).then(async dialog=>{
  assert.match(dialog.message(),/attempted contact/);
  dialogs.push(dialog.message());await dialog.accept();
 });
 await form.locator('button[type="submit"]').click();
 await attemptedApproval;
 await page.getByText('Contact attempt recorded.',{exact:false}).waitFor({timeout:20000});
 state=await snapshot();
 assert.equal(state.tasks.filter(t=>t.quoteId==='q1'&&t.status==='Open').length,1,
  'Attempted contact must preserve open follow-up: '+JSON.stringify({
   tasks:state.tasks.map(t=>({id:t.id,quoteId:t.quoteId,status:t.status,taskKind:t.taskKind,
    completedReason:t.completedReason,contactEventId:t.contactEventId})),
   events:state.events.filter(e=>e.quoteId==='q1').map(e=>({id:e.id,outcome:e.outcome})),
   contactCommands:state.commandLog.filter(e=>e.kind==='pilot.command'&&e.commandId==='customer.contact.record')
    .map(e=>({id:e.id,status:e.status,error:e.error})),
   dialogs,browserErrors
  }));
 assert.equal(state.events.filter(x=>x.quoteId==='q1'&&x.outcome==='attempted').length,1,
  'Attempted event disappeared from committed snapshot: '+JSON.stringify({
   events:state.events.map(e=>({id:e.id,kind:e.kind,quoteId:e.quoteId,outcome:e.outcome})),
   receipts:state.commandLog.filter(x=>x.kind==='customer.contact.record')
    .map(x=>({id:x.id,kind:x.kind,resultId:x.resultId,outcome:x.outcome})),
   commands:state.commandLog.filter(x=>x.kind==='pilot.command'&&x.commandId==='customer.contact.record')
    .map(x=>({id:x.id,status:x.status,error:x.error})),
   quote:state.quotes.find(q=>q.id==='q1'),
   browserErrors
  }));
 assert.equal(state.quotes.find(x=>x.id==='q1').lastContactAt,undefined);
 result.stage='save owner-attested reached contact';
 await page.locator('#tfContactLogForm [name="quoteId"]').selectOption('q1');
 await page.locator('#tfContactLogForm [name="outcome"]').selectOption('reached');
 await page.locator('#tfContactLogForm [name="notes"]').fill('Spoke directly with the customer and confirmed the estimate discussion');
 const reachedApproval=page.waitForEvent('dialog',{timeout:15000}).then(async dialog=>{
  assert.match(dialog.message(),/actually reached this customer/);
  dialogs.push(dialog.message());await dialog.accept();
 });
 await page.locator('#tfContactLogForm button[type="submit"]').click();
 await reachedApproval;
 await page.getByText('Owner-attested customer contact recorded',{exact:false}).waitFor({timeout:20000});
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
 result.stage='reload resolved quotation and task';
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 const persistent=await snapshot();
 assert.equal(persistent.tasks.find(x=>x.id===task.id).status,'Done');
 assert.equal(persistent.quotes.find(x=>x.id==='q1').followupResolution.contactEventId,reached.id);
 result.recoveryAfterReload=true;
 result.quoteNotificationMustNotBeClaimedResolvedByTaskOnly=true;
}

async function committed(page,stores){
 return page.evaluate(async names=>{
  const q=indexedDB.open('tradeflow-lite-v1',9);
  const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  try{return await window.TradeFlowLocalRecovery.readStores(db,names)}
  finally{db.close()}
 },stores);
}
async function verifyInvoiceFollowupJourney(page,result){
 result.stage='review actual overdue invoice follow-up';
 const button=page.locator('[data-revenue-action="followup"][data-id="i1"]');
 await button.waitFor();
 const approval=page.waitForEvent('dialog',{timeout:15000}).then(async dialog=>{
  assert.match(dialog.message(),/internal task for overdue invoice/);
  assert.match(dialog.message(),/No email or payment request/);
  await dialog.accept();
 });
 await button.click();await approval;
 await page.getByText('Internal invoice follow-up task recorded',{exact:false}).waitFor({timeout:20000});
 const data=await committed(page,['invoices','payments','tasks','commandLog']);
 const related=data.tasks.filter(t=>t.invoiceId==='i1'&&t.taskKind==='invoice_follow_up');
 assert.equal(related.length,1,'One approved overdue invoice follow-up task required');
 assert.equal(related[0].status,'Open');
 assert.equal(data.payments.length,1);assert.equal(data.payments[0].amount,30);
 assert.equal(data.commandLog.filter(x=>x.kind==='invoice.followup.schedule').length,1);
 assert.equal(data.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='task.created'&&
  x.ref.id===related[0].id).length,1);
 result.invoiceOwnerApprovedTask=true;
 result.externalPaymentOrEmailSent=false;
 result.stage='reload approved invoice follow-up';
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 const after=await committed(page,['tasks','invoices','payments']);
 assert.equal(after.tasks.filter(t=>t.invoiceId==='i1'&&t.taskKind==='invoice_follow_up').length,1);
 result.invoiceFollowupRecoveredAfterReload=true;
}
async function verifyCalendarConflictJourney(page,result){
 result.stage='review standalone calendar overlap';
 // Notification cards do not themselves navigate; use the existing visible Calendar tab.
 const toggle=page.locator('[data-notif-action="toggle"]');
 if(await toggle.count())await toggle.click();
 await page.locator('[data-tab="calendar"]:visible').first().click();
 await page.locator('.tf-cal-page').waitFor();
 const review=page.locator('[data-calendar-action="conflicts"]');
 await review.waitFor({timeout:15000});
 await review.click();
 // The document click handler renders conflict review asynchronously.
 await page.locator('.tf-cal-review').waitFor({timeout:15000});
 const button=page.locator('[data-calendar-action="resolve-conflict"][data-id="event-a"]');
 if(!await button.count()){
  const screen=await page.locator('body').innerText();
  const diagnostics=await page.evaluate(async()=>{
   const req=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>req.onsuccess=()=>r(req.result));
   const data=await window.TradeFlowLocalRecovery.readStores(db,['calendarEntries','calendarPreferences','jobs','tasks']);db.close();
   return {calendarEntries:data.calendarEntries,detected:window.TradeFlowCalendar?.conflicts?.(data)||[],
    panel:!!document.querySelector('.tf-cal-review'),calendar:!!document.querySelector('.tf-cal-page'),
    conflictButton:!!document.querySelector('[data-calendar-action="conflicts"]')};
  });
  throw Error('Calendar conflict review control not available: '+JSON.stringify({
   screen:screen.slice(-1100),diagnostics}));
 }
 await button.waitFor();
 const dialogs=(async()=>{
  const date=await page.waitForEvent('dialog',{timeout:15000});
  assert.equal(date.type(),'prompt');assert.match(date.message(),/New date/);
  await date.accept('2026-11-05');
  const start=await page.waitForEvent('dialog',{timeout:15000});
  assert.equal(start.type(),'prompt');assert.match(start.message(),/New start time/);
  await start.accept('13:00');
  const confirm=await page.waitForEvent('dialog',{timeout:15000});
  assert.equal(confirm.type(),'confirm');assert.match(confirm.message(),/standalone event/);
  await confirm.accept();
 })();
 await button.click();await dialogs;
 await page.getByText('Calendar reschedule verified and recorded',{exact:false}).waitFor({timeout:20000});
 const state=await committed(page,['calendarEntries','calendarAudit','commandLog','tasks','jobs']);
 assert.equal(state.calendarEntries.find(x=>x.id==='event-a').time,'13:00');
 assert.equal(state.calendarEntries.find(x=>x.id==='event-b').time,'09:30');
 assert.equal(state.calendarAudit.filter(x=>x.kind==='calendar.conflict.rescheduled').length,1);
 assert.equal(state.commandLog.filter(x=>x.kind==='calendar.conflict.reschedule').length,1);
 assert.equal(state.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='calendar.updated').length,1);
 assert.equal(state.tasks.length,0,'No crew or linked task may be silently rescheduled');
 result.standaloneEventRescheduledWithApproval=true;
 result.stage='reload verified calendar move';
 await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
 const after=await committed(page,['calendarEntries']);
 assert.equal(after.calendarEntries.find(x=>x.id==='event-a').time,'13:00');
 result.calendarMoveRecoveredAfterReload=true;
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
    }else if(item.id==='TF-P02'){
     await verifyInvoiceFollowupJourney(page,result);
     // Reconcile the recorded balance using synthetic payment data; this does not assert bank settlement.
     await seed(page,item.resolved,false);await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
     await page.locator('[data-notif-action="toggle"]').click();
     assert.equal(await page.locator('.tf-notif-item').filter({hasText:item.title}).count(),0);
     result.notificationCleared=true;
    }else if(item.id==='TF-P03'){
     await verifyCalendarConflictJourney(page,result);
     await page.locator('[data-notif-action="toggle"]').click();
     assert.equal(await page.locator('.tf-notif-item').filter({hasText:item.title}).count(),0);
     result.notificationCleared=true;
    }else if(item.id==='TF-P04'){
     await verifyChangeOrderReviewJourney(page,result);
     result.stage='change order: cleared detection after recorded owner attestation';
     await page.locator('[data-notif-action="toggle"]').click();
     assert.equal(await page.locator('.tf-notif-item').filter({hasText:item.title}).count(),0);
     result.notificationCleared=true;
    }else if(item.id==='TF-P05'){
     await verifyJobCostReviewJourney(page,result);
     // Synthetic correction removes the overrun detector; the review task remains as an auditable record.
     await seed(page,item.resolved,false);await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
     await page.locator('[data-notif-action="toggle"]').click();
     assert.equal(await page.locator('.tf-notif-item').filter({hasText:item.title}).count(),0);
     result.notificationCleared=true;
    }else if(item.id==='TF-P06'){
     await verifyJobLaborReviewJourney(page,result);
     await seed(page,item.resolved,false);await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
     await page.locator('[data-notif-action="toggle"]').click();
     assert.equal(await page.locator('.tf-notif-item').filter({hasText:item.title}).count(),0);
     result.notificationCleared=true;
    }else if(item.id==='TF-P07'){
     await verifyInvoicePaymentReviewJourney(page,result);
     await seed(page,item.resolved,false);await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot);
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
  }catch(error){result.status='fail';result.error=(result.stage||'scenario setup')+': '+error.message;await page.screenshot({path:path.join(out,item.id+'-'+viewport.width+'-failure.png')}).catch(()=>{})}
  finally{results.push(result);await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({commit:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),kind:'synthetic-browser-product-check',dirty:!!cp.execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),results,painPointsRetired:0},null,2))}
 }}finally{await browser.close();await new Promise(r=>server.close(r))}
 const failed=results.filter(r=>r.status==='fail');for(const row of failed)console.error(row.id+' '+row.viewport.width+': '+row.error);console.log(results.length-failed.length+'/'+results.length+' Chromium workflow scenarios passed; contractor outcomes unverified.');if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
