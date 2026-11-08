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
    // Validate actual 60-frame MP4 playback and changing decoded frames.
    await page.waitForFunction(()=>{
      const orb=document.querySelector('.tf-master-welcome .tf-master-orb');
      const video=orb?.querySelector('video.tf-master-orb-video');
      return !!(orb?.classList.contains('video-ready')&&video?.videoWidth>=256&&video.readyState>=2&&!video.paused);
    },null,{timeout:15000});
    const motion=await page.evaluate(async()=>{
      const video=document.querySelector('.tf-master-orb-video');
      const orb=document.querySelector('.tf-master-orb');
      const canvas=document.createElement('canvas');canvas.width=112;canvas.height=112;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const capture=()=>{
        ctx.drawImage(video,0,0,112,112);
        return new Uint8ClampedArray(ctx.getImageData(0,0,112,112).data);
      };
      const before=video.currentTime,first=capture();
      await new Promise(resolve=>setTimeout(resolve,480));
      const second=capture(),after=video.currentTime;
      let delta=0;
      for(let i=0;i<first.length;i+=4)delta+=Math.abs(first[i]-second[i])+Math.abs(first[i+1]-second[i+1])+Math.abs(first[i+2]-second[i+2]);
      return {before,after,delta,ready:orb.classList.contains('video-ready'),videoWidth:video.videoWidth,videoHeight:video.videoHeight};
    });
    assert.ok(motion.after-motion.before>.20,'MP4 animation playback did not advance');
    assert.ok(motion.delta>1000,'MP4 frames appear visually static');
    assert.equal(motion.ready,true,'GIF should remain until video is playing');
    console.log('PASS: decoded 60-frame MP4 continuously changes the orb',motion);

    await verifyVisualReference(page,out,viewport);
    // Reference controls must match the approved iPhone screenshot regardless
    // of global application button-theme selectors.
    const controls=await page.evaluate(()=>{
      const refs=[
        document.querySelector('.tf-master-send'),
        document.querySelector('.tf-master-compose [aria-label="Talk to TradeFlow"]'),
        document.querySelector('.tf-master-header [aria-label="Back to More"]'),
        document.querySelector('.tf-master-header [aria-label="Conversation history"]')
      ];
      return refs.map(node=>{
        if(!node)throw Error('Founder control missing');
        const button=node.getBoundingClientRect(),glyph=node.querySelector('svg')?.getBoundingClientRect();
        const style=getComputedStyle(node);
        return {label:node.getAttribute('aria-label'),
          background:style.backgroundColor,
          offset:glyph?Math.hypot((glyph.left+glyph.width/2)-(button.left+button.width/2),(glyph.top+glyph.height/2)-(button.top+button.height/2)):null
        };
      });
    });
    assert.equal(controls[0].background,'rgb(248, 250, 251)','Send button must always be white');
    assert.ok(controls.every(x=>x.offset!==null&&x.offset<=2.5),'Control glyphs must be centered in buttons');
    await page.locator('.tf-master-header [aria-label="Back to More"]').click();
    await page.locator('.tf-more-menu [data-tab="ai"]:visible').waitFor({state:'visible'});
    await page.locator('.tf-more-menu [data-tab="ai"]:visible').click();
    await page.locator('.tf-master-welcome h1').waitFor();
    console.log('PASS: white send button, centered icons, Back → More → AI',controls);

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
