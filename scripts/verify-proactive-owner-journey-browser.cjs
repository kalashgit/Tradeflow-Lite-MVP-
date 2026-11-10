#!/usr/bin/env node
/* TradeFlow Master Intelligence — real Chromium read-only, device-local proactive review.
 * Only synthetic local records are installed. No cloud auth, payment or external action.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createPreviewServer}=require('./local-ai-preview-server.cjs');
const out=path.resolve('artifacts/proactive-owner-journey');
fs.mkdirSync(out,{recursive:true});

async function getRecords(page){
 return page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('tradeflow-lite-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  try{
   const stores=['aiConversationThreads','aiConversationTurns','tasks','invoices'];
   const tx=db.transaction(stores,'readonly');
   const rows={};
   for(const name of stores)rows[name]=await new Promise((resolve,reject)=>{const q=tx.objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   return rows;
  }finally{db.close()}
 });
}
async function insertSyntheticRecords(page){
 await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('tradeflow-lite-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  try{
   const tx=db.transaction(['settings','customers','jobs','invoices','quotes'],'readwrite');
   tx.objectStore('settings').put({id:'business',company:'Synthetic TF Proactive QA',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true});
   tx.objectStore('customers').put({id:'customer_proactive',businessId:'local-business',name:'Synthetic Customer'});
   tx.objectStore('jobs').put({id:'job_proactive',businessId:'local-business',title:'Electrical service QA',status:'In Progress',customerId:'customer_proactive',date:'2026-11-11'});
   tx.objectStore('invoices').put({id:'invoice_proactive',businessId:'local-business',status:'Issued',jobId:'job_proactive',customerId:'customer_proactive',dueDate:'2026-11-09',currency:'USD'});
   tx.objectStore('quotes').put({id:'quote_proactive',businessId:'local-business',status:'Sent',customerId:'customer_proactive',sentDate:'2026-10-15',currency:'USD'});
   await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error)});
  }finally{db.close()}
 });
}
(async()=>{
 const {server}=createPreviewServer({secret:'synthetic-proactive-test-no-real-credentials',mode:'mock'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({args:['--no-sandbox']});
 let completed=0;
 try{
  for(const width of [390,1280]){
   const ctx=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
   await ctx.tracing.start({screenshots:true,snapshots:true,sources:true});
   const page=await ctx.newPage(),requests=[];
   page.on('request',req=>{if(req.url().includes('/api/ai/chat'))requests.push(req.url())});
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.waitForFunction(()=>!!window.TradeFlowPilot);
   await insertSyntheticRecords(page);
   await page.reload();
   await page.waitForFunction(()=>!!window.TradeFlowPilot);
   await page.evaluate(()=>{
    const tab=document.querySelector('[data-tab="ai"]');
    if(!tab)throw Error('Master Intelligence navigation missing');
    tab.click();
   });
   const starter=page.locator('.tf-master-starters [data-action="tfAiStarter"]').filter({hasText:'Review Local Priorities'});
   await starter.waitFor();
   await starter.click();
   assert.equal(await page.locator('#tfAiPrompt').inputValue(),'Review my device-local priorities');
   await page.locator('#tfAiChatForm button[type="submit"]').click();
   await page.waitForFunction(()=>[...document.querySelectorAll('.tf-master-message-text')].some(el=>el.textContent.includes('DEVICE-LOCAL PROACTIVE REVIEW')),{timeout:15000}).catch(async e=>{
    await page.screenshot({path:path.join(out,'debug-'+width+'.png')});throw e;
   });
   const text=await page.locator('.tf-master-conversation').innerText();
   assert.match(text,/DEVICE-LOCAL PROACTIVE REVIEW/);
   assert.match(text,/not authenticated cloud evidence/);
   assert.match(text,/No record was changed, no message sent, no command executed/);
   assert.ok(!text.includes('authenticated current records'), 'must not claim cloud identity');
   assert.deepEqual(requests,[],'local review must not contact an AI provider');
   const before=await getRecords(page);
   assert.equal(before.aiConversationThreads.length,1);
   assert.equal(before.aiConversationTurns.length,2);
   assert.equal(before.aiConversationTurns.filter(t=>t.source==='device_local_evidence').length,1);
   assert.equal(before.tasks.length,0,'read-only review cannot create a task');
   assert.equal(before.invoices.length,1);
   assert.equal(before.invoices[0].status,'Issued','invoice must remain unchanged');
   await page.screenshot({path:path.join(out,'review-'+width+'.png'),fullPage:true});
   await page.reload();
   await page.waitForFunction(()=>!!window.TradeFlowPilot);
   const after=await getRecords(page);
   assert.equal(after.aiConversationTurns.length,2,'reload must not duplicate a proactive review');
   assert.equal(after.aiConversationThreads.length,1);
   assert.equal(after.tasks.length,0);
   assert.deepEqual(requests,[]);
   await ctx.tracing.stop({path:path.join(out,'trace-'+width+'.zip')});
   await ctx.close();
   completed++;
   process.stdout.write('PASS local proactive Master Intelligence review '+width+'px — same thread, source labelled, no writes/providers, reload stable\n');
  }
  assert.equal(completed,2);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
