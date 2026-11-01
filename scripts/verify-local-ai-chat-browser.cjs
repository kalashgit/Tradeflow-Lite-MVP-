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
    // The live TradeFlow navigation handler owns the transition to the existing chat screen.
    await page.evaluate(()=>{const nav=document.querySelector('[data-tab="ai"]');if(!nav)throw Error('TradeFlow AI navigation item not found');nav.click()});
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
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,viewport.name+'.png'),fullPage:true});
    results.push({viewport:viewport.name,source:'synthetic_mock',evidenceVisible:true,activeBusinessMutations:metrics.writes,actualQwenTested:false});
   } finally {await context.close()}
  }
  assert.equal(metrics.reads,4);
  assert.equal(metrics.writes,0);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({synthetic:true,results},null,2));
  console.log('2/2 TradeFlow existing AI conversation Chromium journeys passed; mock model, synthetic context, zero business writes.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error('Synthetic conversation browser verification failed:',e);process.exitCode=1});
