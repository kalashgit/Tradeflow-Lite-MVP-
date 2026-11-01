#!/usr/bin/env node
// Actual existing TradeFlow conversation UI on mobile/desktop, synthetic authorized context.
// Uses isolated localhost preview and synthetic model; no external model, D1 or customer data.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createPreviewServer}=require('./local-ai-preview-server.cjs');
const out=path.resolve('artifacts/local-ai-conversation');
fs.mkdirSync(out,{recursive:true});
const token='synthetic-browser-local-private-test-token';
(async()=>{
 const {server,metrics}=createPreviewServer({secret:token,mode:'mock'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({args:['--no-sandbox']});
 const results=[];
 try {
  for(const viewport of [{width:390,height:844,name:'mobile'},{width:1280,height:900,name:'desktop'}]){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},serviceWorkers:'block'});
   const page=await context.newPage();
   try {
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.TradeFlowPilot,{timeout:30000});
    // New installations enter onboarding. Complete it ONLY in this isolated browser's
    // local IndexedDB, consistent with existing synthetic TradeFlow browser journeys.
    await page.evaluate(async()=>{
     const request=indexedDB.open('tradeflow-lite-v1');
     const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
     const tx=db.transaction('settings','readwrite');
     tx.objectStore('settings').put({id:'business',company:'Synthetic AI Conversation Test',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true});
     await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
     db.close();
    });
    await page.reload();
    await page.waitForFunction(()=>!!document.querySelector('[data-tab="settings"]'),{timeout:30000});
    // Use the existing More → TradeFlow AI navigation, not a replacement interface.
    await page.locator('[data-tab="settings"]:visible').first().click();
    await page.locator('.tf-more-menu [data-tab="ai"]').click();
    await page.locator('#tfAiUnlockForm input[name="code"]').fill(token);
    await page.locator('#tfAiUnlockForm button[type="submit"]').click();
    await page.waitForFunction(()=>sessionStorage.getItem('tf-ai-preview-code')!==null);
    const input=page.locator('#tfAiChatForm textarea[name="prompt"]');
    await input.fill('What should I prioritize today to improve profitability?');
    await page.locator('#tfAiChatForm button[type="submit"]').click();
    const source=page.locator('.tf-ai-chat-thread .tf-ai-evidence');
    await source.waitFor({timeout:30000});
    const text=await source.innerText();
    assert.match(text,/SYNTHETIC.*MOCK/);
    assert.match(text,/invoices:synthetic_invoice_01@1/);
    assert.equal(await page.locator('.tf-ai-chat-error:visible').count(),0);
    assert.match(await page.locator('.tf-ai-local-label').innerText(),/LOCAL ONLY.*NOT SYNCED/);
    const firstThread=await page.locator('#tfAiThreadPicker').inputValue();
    assert.ok(firstThread,'A persisted thread should be created by the first send');
    await page.reload();
    await page.waitForFunction(()=>!!window.TradeFlowPilot,{timeout:30000});
    await page.locator('[data-tab="settings"]:visible').first().click();
    await page.locator('.tf-more-menu [data-tab="ai"]').click();
    assert.equal(await page.locator('.tf-ai-chat-thread .tf-ai-bubble').count(),2,'Messages must survive refresh');
    assert.match(await page.locator('.tf-ai-chat-thread').innerText(),/What should I prioritize today/);
    await page.locator('[data-action="tfAiNewThread"]').click();
    assert.equal(await page.locator('.tf-ai-chat-thread .tf-ai-bubble').count(),0);
    assert.equal(await page.locator('#tfAiThreadPicker option').count(),2);
    await page.locator('#tfAiChatForm textarea[name="prompt"]').fill('Give me a concise generic safety checklist.');
    await page.locator('#tfAiChatForm button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.tf-ai-chat-thread .tf-ai-bubble').length===2);
    await page.locator('#tfAiThreadPicker').selectOption(firstThread);
    assert.equal(await page.locator('.tf-ai-chat-thread .tf-ai-bubble').count(),2,'Switching threads restores scoped turns');
    const scoped=await page.evaluate(async(threadId)=>{
     const r=indexedDB.open('tradeflow-lite-v1');
     const db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
     const store=window.TradeFlowConversationStore;
     const local={kind:'local',businessId:'local-business',actorId:'local-owner'};
     const foreign={kind:'local',businessId:'other-business',actorId:'another-owner'};
     const hidden=await store.listThreads(db,foreign);
     let denied=false;
     try{await store.listTurns(db,foreign,threadId)}catch{denied=true}
     const event={id:'fixture_'+threadId.slice(0,12),role:'user',content:'Scoped storage test',
      modality:'voice',status:'committed',source:'user'};
     await store.appendTurn(db,local,threadId,event);
     await store.appendTurn(db,local,threadId,event);
     const turns=await store.listTurns(db,local,threadId);
     let conflictDenied=false;
     try{await store.appendTurn(db,local,threadId,{...event,content:'Conflicting duplicate'})}
     catch{conflictDenied=true}
     db.close();
     return {foreignCount:hidden.length,denied,count:turns.length,conflictDenied};
    },firstThread);
    assert.deepEqual(scoped,{foreignCount:0,denied:true,count:3,conflictDenied:true});
    await page.reload();
    await page.waitForFunction(()=>!!window.TradeFlowPilot,{timeout:30000});
    await page.locator('[data-tab="settings"]:visible').first().click();
    await page.locator('.tf-more-menu [data-tab="ai"]').click();
    await page.locator('#tfAiThreadPicker').selectOption(firstThread);
    assert.equal(await page.locator('.tf-ai-chat-thread .tf-ai-bubble').count(),3,'Final voice transcript uses same thread and survives reload');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('[data-action="tfAiClear"]').click();
    assert.equal(await page.locator('#tfAiThreadPicker option').count(),1,'Delete removes only selected thread');
    assert.equal(await page.locator('.tf-ai-chat-thread .tf-ai-bubble').count(),2,'Other thread remains');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,viewport.name+'.png'),fullPage:true});
    results.push({viewport:viewport.name,source:'synthetic_mock',evidenceVisible:true,activeBusinessMutations:metrics.writes,actualQwenTested:false});
   } finally {await context.close()}
  }
  assert.equal(metrics.reads,6);
  assert.equal(metrics.writes,0);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({synthetic:true,results},null,2));
  console.log('2/2 TradeFlow AI durable-history Chromium journeys passed; scoped local threads, reload, dedupe, delete, mock inference, zero business writes.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error('Synthetic conversation browser verification failed:',e);process.exitCode=1});
