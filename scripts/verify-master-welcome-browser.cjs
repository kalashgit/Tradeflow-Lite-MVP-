#!/usr/bin/env node
// Rendered, synthetic-only test of the new welcome → conversation journey.
// No external model, real customer data, or production business writes.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createPreviewServer}=require('./local-ai-preview-server.cjs');
const {verifyVisualReference}=require('./master-visual-acceptance.cjs');
const token='synthetic-browser-local-private-test-token';
(async()=>{
 const {server,metrics}=createPreviewServer({secret:token,mode:'mock'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({args:['--no-sandbox']});
 const out=path.resolve('artifacts/master-intelligence-welcome');
 fs.mkdirSync(out,{recursive:true});
 try {
  for(const viewport of [{name:'mobile',width:390,height:844},{name:'desktop',width:1280,height:900}]){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},serviceWorkers:'block'});
   const page=await context.newPage();
   try{
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.TradeFlowPilot);
    await page.evaluate(async()=>{
      const request=indexedDB.open('tradeflow-lite-v1');
      const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
      const tx=db.transaction('settings','readwrite');
      tx.objectStore('settings').put({id:'business',company:'Synthetic Master Intelligence Test',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true});
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
      db.close();
    });
    await page.reload();
    await page.locator('[data-tab="settings"]:visible').first().click();
    await page.locator('.tf-more-menu [data-tab="ai"]').click();
    await page.locator('.tf-master-welcome h1').waitFor();
    assert.match(await page.locator('.tf-master-welcome h1').innerText(),/Master Intelligence/);
    assert.equal(await page.locator('.tf-master-conversation').count(),0);
    // Motion is an acceptance criterion: static screenshots alone cannot pass.
    await page.waitForFunction(()=>{
      const orb=document.querySelector('.tf-master-orb');
      const canvas=orb?.querySelector('canvas.tf-master-live-mesh');
      return orb?.dataset.meshState==='flowing' && Number(canvas?.dataset.motionFrames)>=3;
    },null,{timeout:15000});
    const orbMotion=await page.evaluate(async()=>{
      const orb=document.querySelector('.tf-master-orb');
      const canvas=orb.querySelector('canvas.tf-master-live-mesh');
      const style=getComputedStyle(canvas);
      const sample=()=>{
        const ctx=canvas.getContext('2d');
        const {width:w,height:h}=canvas;
        const data=ctx.getImageData(0,0,w,h).data;
        const out=[];
        for(let y=Math.round(h*.18);y<h*.82;y+=Math.max(1,Math.floor(h/45))){
          for(let x=Math.round(w*.18);x<w*.82;x+=Math.max(1,Math.floor(w/45))){
            const i=(y*w+x)*4;out.push(data[i],data[i+1],data[i+2]);
          }
        }
        return out;
      };
      const first=sample(),before=Number(canvas.dataset.motionFrames);
      await new Promise(resolve=>setTimeout(resolve,600));
      const second=sample(),after=Number(canvas.dataset.motionFrames);
      let changed=0;
      for(let i=0;i<first.length;i++)changed+=Math.abs(first[i]-second[i]);
      return {before,after,changed,visible:style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0,mode:orb.dataset.meshState};
    });
    assert.equal(orbMotion.visible,true,'Orb canvas is hidden');
    assert.ok(orbMotion.after-orbMotion.before>=8,'Orb frames did not advance');
    assert.ok(orbMotion.changed>=1500,'Orb canvas looks static despite advancing frames');
    console.log('PASS: visual orb motion verified over 600ms',orbMotion);

    await verifyVisualReference(page,out,viewport);
    await page.locator('#tfAiChatForm textarea[name="prompt"]').fill('What should I prioritize today to improve profitability?');
    await page.locator('#tfAiChatForm button[type="submit"]').click();
    await page.locator('.tf-ai-pending-connection').waitFor();
    await page.locator('#tfAiUnlockForm input[name="code"]').fill(token);
    await page.locator('#tfAiUnlockForm button[type="submit"]').click();
    await page.waitForFunction(()=>sessionStorage.getItem('tf-ai-preview-code')!==null);
    await page.locator('.tf-master-conversation .tf-master-message.is-assistant').waitFor({timeout:30000});
    assert.equal(await page.locator('.tf-master-conversation .tf-master-message.is-user').count(),1);
    assert.match(await page.locator('.tf-master-conversation .tf-master-message.is-assistant').getAttribute('title'),/Source: synthetic mock/);
    assert.equal(await page.locator('.tf-master-error:visible').count(),0);
    await page.reload();
    await page.locator('[data-tab="settings"]:visible').first().click();
    await page.locator('.tf-more-menu [data-tab="ai"]').click();
    await page.locator('.tf-master-conversation .tf-master-message.is-assistant').waitFor();
    assert.equal(await page.locator('.tf-master-conversation .tf-master-message').count(),2);
    await page.locator('[data-action="tfAiHistoryToggle"]').first().click();
    assert.match(await page.locator('.tf-ai-local-label').innerText(),/LOCAL ONLY.*NOT SYNCED/);
    await page.locator('#tfMasterToolbar [data-action="tfAiNewThread"]').first().click();
    await page.locator('.tf-master-welcome h1').waitFor();
    assert.equal(await page.locator('.tf-master-conversation .tf-master-message').count(),0);
    assert.equal(await page.locator('.tf-ai-history select option').count(),2);
    await page.screenshot({path:path.join(out,viewport.name+'.png'),fullPage:true});
   }finally{await context.close()}
  }
  assert.equal(metrics.writes,0,'No synthetic conversation may write business records');
  console.log('PASS: 2/2 Master Intelligence welcome/chat Chromium journeys; local history, mock source labels, new thread and no business writes.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error('Master Intelligence welcome Chromium verification failed:',error);process.exitCode=1});
