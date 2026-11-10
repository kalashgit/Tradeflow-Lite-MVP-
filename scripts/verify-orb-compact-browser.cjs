#!/usr/bin/env node
/* G02 Issue #51: rendered mobile/desktop behavior on isolated synthetic fixtures. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createPreviewServer}=require('./local-ai-preview-server.cjs');
const output=path.resolve('artifacts/orb-compact');
fs.mkdirSync(output,{recursive:true});
const secret='synthetic-orb-only-private-test-token';

async function seed(page){
 await page.goto(page.context()._g02Url);
 await page.waitForFunction(()=>!!window.TradeFlowPilot);
 await page.evaluate(async()=>{
  const request=indexedDB.open('tradeflow-lite-v1');
  const db=await new Promise(resolve=>request.onsuccess=()=>resolve(request.result));
  const tx=db.transaction('settings','readwrite');
  tx.objectStore('settings').put({id:'business',company:'Synthetic Orb QA',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true});
  await new Promise(resolve=>tx.oncomplete=resolve);db.close();
 });
 await page.reload();await page.locator('.tf-ai-orb').waitFor();await page.waitForFunction(()=>!!window.TradeFlowVoice?.state,{timeout:30000});
}
async function bounds(page,width){
 return page.evaluate(width=>{
  const rect=el=>el.getBoundingClientRect();
  const bubble=rect(document.querySelector('#tfOrbBubble'));
  const orb=rect(document.querySelector('.tf-ai-orb'));
  const nav=document.querySelector('.mobilebar'),navigation=nav?rect(nav):null;
  return {bubble:{left:bubble.left,right:bubble.right,bottom:bubble.bottom,height:bubble.height},orb:{left:orb.left,right:orb.right,top:orb.top},nav:navigation?{top:navigation.top,bottom:navigation.bottom}:null,overflow:document.documentElement.scrollWidth>width};
 },width);
}
(async()=>{
 const {server}=createPreviewServer({secret,mode:'mock'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({args:['--no-sandbox']});const evidence=[];
 try{
  for(const width of [360,390,430,1280]){
   const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
   await context.tracing.start({screenshots:true,snapshots:true,sources:true});
   context._g02Url='http://127.0.0.1:'+server.address().port;
   const page=await context.newPage();
   await page.addInitScript(()=>{
    window.__g02Starts=0;window.__g02Aborts=0;
    class MockSpeechRecognition{
     start(){window.__g02Starts++;this.onstart?.()}
     stop(){this.onend?.()}
     abort(){window.__g02Aborts++;this.onend?.()}
    }
    window.SpeechRecognition=MockSpeechRecognition;
   });
   await seed(page);
   const orb=page.locator('.tf-ai-orb');await orb.click();
   try{await page.locator('#tfOrbBubble').waitFor({timeout:5000})}catch(error){console.error('G02 orb activation diagnostic',width,await page.evaluate(()=>({state:window.TradeFlowVoice?.state?.(),orb:document.querySelector('.tf-ai-orb')?.outerHTML,legacy:!!document.querySelector('.tf-voice-sheet'),bubble:!!document.querySelector('#tfOrbBubble')})));throw error}
   assert.equal(await page.locator('.tf-voice-overlay,.tf-voice-sheet').count(),0);
   assert.equal(await orb.getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('#tfOrbBubble').getAttribute('role'),'region');
   assert.equal(await page.locator('#tfOrbStatus').getAttribute('aria-live'),'polite');
   assert.equal(await page.evaluate(()=>window.__g02Starts),1);
   const b=await bounds(page,width);
   assert.ok(b.bubble.left>=0&&b.bubble.right<=width+1,JSON.stringify({width,b}));
   assert.ok(b.bubble.right<=b.orb.left+1,'Bubble must be left of orb');
   assert.equal(b.overflow,false,'No horizontal overflow');
   assert.ok(!b.nav||width>850||b.bubble.bottom<=b.nav.top+2,'Bubble must not obstruct navigation');
   const actions=await page.locator('#tfVoiceForm .tf-orb-actions button').evaluateAll(buttons=>buttons.map(button=>{
    const rect=button.getBoundingClientRect(),style=getComputedStyle(button);
    return {top:rect.top,left:rect.left,right:rect.right,bottom:rect.bottom,background:style.backgroundColor};
   }));
   assert.equal(actions.length,3);
   assert.ok(actions.every(action=>Math.abs(action.top-actions[0].top)<1),'Stop, command and Send must share one row');
   assert.ok(actions.every(action=>action.left>=b.bubble.left&&action.right<=b.bubble.right+1),'Actions must stay inside bubble');
   assert.notEqual(actions[0].background,actions[2].background,'Only Send should have the primary accent');
   await page.screenshot({path:path.join(output,'compact-'+width+'.png'),animations:'disabled'});
   await orb.click();await page.locator('#tfOrbBubble').waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>window.__g02Starts),1,'Repeated tap must not start another capture');
   assert.ok(await page.evaluate(()=>window.__g02Aborts)>=1,'Closing must abort capture');
   assert.equal(await orb.getAttribute('aria-expanded'),'false');
   await orb.focus();await page.keyboard.press('Enter');await page.locator('#tfOrbBubble').waitFor();
   assert.equal(await page.locator('#tfOrbBubble button:focus-visible').count(),0);
   assert.ok(await page.locator('#tfOrbBubble').evaluate(el=>parseFloat(getComputedStyle(el).animationDuration)<=0.001),'Reduced motion must have no perceptible animation');
   await page.locator('#tfVoiceText').fill('Synthetic question');
   await page.locator('#tfVoiceForm button[type="submit"]').click();
   await page.locator('.tf-orb-feedback').filter({hasText:/not sent/i}).waitFor({timeout:5000});
   assert.match(await page.locator('.tf-orb-feedback').innerText(),/not sent/i,'Locked AI must not claim success');
   await page.locator('[data-voice="close"]').click();
   await page.waitForFunction(()=>document.activeElement?.classList.contains('tf-ai-orb'),null,{timeout:5000});
   await page.evaluate(()=>{window.SpeechRecognition=class{start(){throw Error('not-allowed')}abort(){}}});
   await orb.click();await page.locator('#tfOrbBubble').waitFor();
   assert.match(await page.locator('#tfOrbBubble').innerText(),/Could not start microphone/);
   assert.equal(await page.locator('#tfVoiceText').isEnabled(),true);
   await page.locator('[data-voice="close"]').click();
   // The browser may defer onstart during its permission prompt. Never show
   // "Listening" or audio-reactive activity during that pending interval.
   await page.evaluate(()=>{
    window.SpeechRecognition=class{
     start(){window.__g02PendingMic=this}
     stop(){this.onend?.()}
     abort(){this.onend?.()}
    };
   });
   await orb.click();await page.locator('#tfOrbBubble').waitFor();
   assert.equal(await page.locator('#tfOrbBubble').getAttribute('data-voice-state'),'requesting');
   assert.match(await page.locator('#tfOrbStatus').innerText(),/Requesting microphone/);
   assert.equal(await page.locator('[data-voice="mic"]').getAttribute('aria-pressed'),'false');
   await page.evaluate(()=>{
    window.__g02PendingMic.onresult?.({results:[[{transcript:'Synthetic partial speech'}]]});
    window.__g02PendingMic.onerror?.({error:'not-allowed'});
   });
   // DOM repaint is asynchronous after the synthetic onerror event. Assert the
   // eventual visible error state rather than racing the pending-request UI.
   await page.locator('#tfOrbBubble').filter({hasText:/Microphone permission denied/}).waitFor({timeout:5000});
   await page.waitForFunction(()=>document.querySelector('#tfOrbBubble')?.getAttribute('data-voice-state')==='error',null,{timeout:5000});
   assert.equal(await page.locator('#tfVoiceText').inputValue(),'','Denied permission must not leave a sendable partial transcript');
   assert.equal(await page.locator('[data-voice="mic"]').getAttribute('aria-pressed'),'false');
   await context.setOffline(true);
   assert.match(await page.locator('.tf-orb-capability').innerText(),/Speech may require network/);
   assert.equal(await page.locator('#tfVoiceText').isEnabled(),true,'Offline must retain text entry');
   await context.setOffline(false);
   await page.locator('[data-voice="close"]').click();
   await page.evaluate(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition});
   await orb.click();await page.locator('#tfOrbBubble').waitFor();
   assert.match(await page.locator('#tfOrbBubble').innerText(),/Speech recognition is unavailable|Speech unavailable/);
   await page.locator('[data-voice="close"]').click();
   evidence.push({width,bounds:b,captureStarts:1,closeAborts:true,reducedMotion:true,lockedSendRejected:true,permissionFailure:true,pendingPermissionTruthful:true,deniedPartialDiscarded:true,offlineTextFallback:true,unsupportedFallback:true});
   await context.tracing.stop({path:path.join(output,'trace-'+width+'.zip')});
   await context.close();
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(evidence,null,2));
  console.log('G02 compact orb: 360/390/430/1280 rendered journeys passed');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
