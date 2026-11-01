#!/usr/bin/env node
/* Real Chromium mobile/desktop journey through existing TradeFlow AI chat.
 * Synthetic local records only; no model, financial mutation or deployment.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createPreviewServer}=require('./local-ai-preview-server.cjs');
const out=path.resolve('artifacts/master-intelligence-briefing');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const {server,metrics}=createPreviewServer({secret:'synthetic-master-intelligence-test-token',mode:'mock'});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const url='http://127.0.0.1:'+server.address().port;
  for(const viewport of [{name:'mobile',width:390,height:844},{name:'desktop',width:1280,height:900}]){
   const context=await browser.newContext({viewport,serviceWorkers:'block'});
   try{
    const page=await context.newPage();
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.TradeFlowPilot,{timeout:30000});
    await page.evaluate(async()=>{
     const request=indexedDB.open('tradeflow-lite-v1');
     const db=await new Promise((ok,bad)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>bad(request.error)});
     const t=db.transaction(['settings','jobs','quotes','customers','tasks'],'readwrite');
     t.objectStore('settings').put({id:'business',company:'Synthetic Briefing Contractor',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true});
     t.objectStore('customers').put({id:'c1',name:'Synthetic Customer',businessId:'local-business'});
     t.objectStore('quotes').put({id:'q1',customerId:'c1',status:'Accepted',businessId:'local-business'});
     t.objectStore('jobs').put({id:'j1',title:'Synthetic finished job',customerId:'c1',quoteId:'q1',status:'Completed',businessId:'local-business'});
     t.objectStore('jobs').put({id:'j2',title:'Synthetic active job',status:'Active',businessId:'local-business'});
     t.objectStore('tasks').put({id:'task1',title:'Synthetic follow-up',status:'Open',businessId:'local-business'});
     await new Promise((ok,bad)=>{t.oncomplete=ok;t.onerror=()=>bad(t.error)});db.close();
    });
    await page.reload();
    await page.waitForFunction(()=>!!window.TradeFlowPilot,{timeout:30000});
    await page.locator('[data-tab="settings"]:visible').first().click();
    await page.locator('.tf-more-menu [data-tab="ai"]').click();
    const input=page.locator('#tfAiChatForm textarea[name="prompt"]');
    await input.fill('TradeFlow, give me an update on my business. What needs attention?');
    await page.locator('#tfAiChatForm button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.tf-ai-chat-thread .tf-ai-bubble').length===2,{timeout:30000});
    let thread=await page.locator('#tfAiThread').innerText();
    assert.match(thread,/DEVICE-LOCAL BUSINESS BRIEFING/);
    assert.match(thread,/1 active, 1 completed/);
    assert.match(thread,/Invoice blocked for Synthetic finished job/);
    assert.match(thread,/No invoice draft/);
    assert.equal(await page.locator('.tf-ai-chat-error:visible').count(),0);
    await input.fill('Why is that job blocked?');
    await page.locator('#tfAiChatForm button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.tf-ai-chat-thread .tf-ai-bubble').length===4,null,{timeout:30000});
    thread=await page.locator('#tfAiThread').innerText();
    assert.match(thread,/Latest invoice readiness for Synthetic finished job: blocked/);
    assert.match(thread,/completion_signoff_unverified/);
    assert.equal(await page.locator('.tf-ai-chat-error:visible').count(),0);
    const saved=await page.evaluate(async()=>{
     const request=indexedDB.open('tradeflow-lite-v1');
     const db=await new Promise((ok,bad)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>bad(request.error)});
     const t=db.transaction(['invoices','commandLog'],'readonly');
     const rows=await Promise.all(['invoices','commandLog'].map(s=>new Promise((ok,bad)=>{const r=t.objectStore(s).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)})));
     db.close();return rows.map(x=>x.length);
    });
    assert.deepEqual(saved,[0,0],'Briefing and explanation must not write business records');
    await page.screenshot({path:path.join(out,viewport.name+'.png'),fullPage:true});
    await page.reload();
    await page.waitForFunction(()=>!!window.TradeFlowPilot,{timeout:30000});
    await page.locator('[data-tab="settings"]:visible').first().click();
    await page.locator('.tf-more-menu [data-tab="ai"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.tf-ai-chat-thread .tf-ai-bubble').length===4,null,{timeout:15000});
    assert.match(await page.locator('#tfAiThread').innerText(),/Latest invoice readiness/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    console.log('Master Intelligence '+viewport.name+' briefing and context followup passed');
   }finally{await context.close()}
  }
  assert.equal(metrics.writes,0,'No remote write attempted');
  assert.equal(metrics.reads,0,'Local briefing never called mock model');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({synthetic:true,viewports:['mobile','desktop'],modelRequests:metrics.reads,externalWrites:metrics.writes},null,2));
 }finally{await browser.close();await new Promise(ok=>server.close(ok))}
})().catch(error=>{console.error('Master Intelligence briefing Chromium failed:',error);process.exitCode=1});
