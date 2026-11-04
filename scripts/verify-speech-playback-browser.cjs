#!/usr/bin/env node
// Deterministic browser regression with an explicitly STUBBED model and prerecorded decoder probe.
// NOT real provider / voice acceptance. The separate real-provider script never uses these stubs.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const {createPreviewServer}=require('./local-ai-preview-server.cjs');
const {createLocalTtsProvider}=require('../src/local-tts-provider.cjs');
const out=path.resolve('artifacts/voice-01/browser-regression');fs.mkdirSync(out,{recursive:true});
(async()=>{

 const probe=fs.readFileSync(path.resolve('tests/fixtures/voice/playback-probe.wav'));
 const provider={health:async()=>({ready:true,fixture:true}),synthesize:async(text,{signal})=>{await new Promise((r,j)=>{const timer=setTimeout(r,80);signal.addEventListener('abort',()=>{clearTimeout(timer);j(Object.assign(Error('cancelled'),{name:'AbortError'}))},{once:true})});return {audio:probe,provider:'fixture_only',textSha256:crypto.createHash('sha256').update(text).digest('hex')}}};
 assert.equal((await provider.health()).ready,true,'Pinned real speech model must be available');
 const secret=crypto.randomBytes(24).toString('base64url');
 const {server,metrics}=createPreviewServer({secret,mode:'live',speechProvider:provider,localFetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:'TradeFlow is ready. What would you like to review?'},finish_reason:'stop'}]})})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({args:['--no-sandbox','--autoplay-policy=user-gesture-required']});const results=[];
 try{
 for(const viewport of [{width:390,height:844,name:'mobile'},{width:1280,height:900,name:'desktop'}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',recordVideo:{dir:out,size:{width:viewport.width,height:viewport.height}}});
  await context.tracing.start({screenshots:true,snapshots:true});
  const page=await context.newPage();
  await page.goto(url);await page.waitForFunction(()=>!!window.TradeFlowPilot);
  await page.evaluate(async()=>{const r=indexedDB.open('tradeflow-lite-v1');const db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'business',company:'Synthetic Voice Test',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true});await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=j});db.close()});
  await page.reload();await page.locator('[data-tab="settings"]:visible').first().click();await page.locator('.tf-more-menu [data-tab="ai"]').click();
  await page.locator('#tfAiUnlockForm input').fill(secret);await page.locator('#tfAiUnlockForm button').click();await page.waitForFunction(()=>!!sessionStorage.getItem('tf-ai-preview-code'));
  await page.evaluate(()=>{window.__voiceFeatures=[];window.addEventListener('tradeflow:speech-features',e=>{const f=e.detail;window.__voiceFeatures.push({rms:f.rms,active:f.active,at:f.at})})});
  const question='Give two ways an electrician can reduce return trips.';
  await page.locator('#tfAiPrompt').fill(question);const chatResponse=page.waitForResponse(r=>r.url().endsWith('/api/ai/chat'));const inferenceAt=Date.now();await page.locator('#tfAiChatForm button[type=submit]').click();
  const payload=await (await chatResponse).json();assert.equal(payload.source,'general_advice');assert.ok(payload.speech);assert.equal(payload.executionAuthority,false);
  const inferenceMs=Date.now()-inferenceAt;
  await page.locator('[data-speech-speak]').waitFor();assert.match(await page.locator('.tf-ai-theirs').innerText(),new RegExp(payload.reply.slice(0,15).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await page.screenshot({path:path.join(out,viewport.name+'-before.png'),fullPage:true});
  const speechResponse=page.waitForResponse(r=>r.url().endsWith('/api/ai/speech/synthesize'),{timeout:70000});const speakAt=Date.now();await page.locator('[data-speech-speak]').click();
  const speech=await speechResponse;assert.equal(speech.status(),200);const wav=await speech.body();assert.equal(wav.toString('ascii',0,4),'RIFF');fs.writeFileSync(path.join(out,viewport.name+'-actual-answer.wav'),wav);
  await page.waitForFunction(()=>window.TradeFlowSpeech.getState().status==='speaking',null,{timeout:70000});const playbackStartMs=Date.now()-speakAt;
  await page.waitForFunction(()=>window.__voiceFeatures.some(f=>f.active&&f.rms>.001));
  await page.screenshot({path:path.join(out,viewport.name+'-speaking.png'),fullPage:true});
  await page.locator('[data-speech-stop]:visible').click();assert.equal(await page.evaluate(()=>window.TradeFlowSpeech.getState().status),'idle');
  // Cancelling in-flight synthesis must never start a late reply in a new thread.
  await page.locator('[data-speech-speak]').click();await page.locator('[data-action=tfAiNewThread]').click();await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-speech-speak]').count(),0);assert.equal(await page.evaluate(()=>window.TradeFlowSpeech.getState().status),'idle');
  const stats=await page.evaluate(()=>({nonzeroFrames:window.__voiceFeatures.filter(f=>f.active&&f.rms>.001).length,overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(stats.overflow,false);
  await page.locator('#tfAiThreadPicker').selectOption(payload.speech.threadId);
  await context.setOffline(true);
  await page.locator('[data-speech-speak]').click();
  await page.waitForFunction(()=>window.TradeFlowSpeech.getState().status==='unavailable');
  assert.equal(await page.locator('[data-speech-stop]:visible').count(),0);
  await context.setOffline(false);
  await page.locator('[data-speech-speak]').click();
  await page.waitForFunction(()=>window.TradeFlowSpeech.getState().status==='speaking');
  await page.locator('[data-tab="settings"]:visible').first().click();
  assert.equal(await page.evaluate(()=>window.TradeFlowSpeech.getState().status),'idle');
  assert.equal(metrics.writes,0);
  results.push({viewport:viewport.name,question,actualGeneratedAnswer:payload.reply,source:payload.source,inferenceMs,clickToWebAudioStartMs:playbackStartMs,actualAudioSha256:crypto.createHash('sha256').update(wav).digest('hex'),...stats,zeroBusinessWrites:true,physicalAudibilityVerified:false});
  await context.tracing.stop({path:path.join(out,viewport.name+'-trace.zip')});
  require('node:child_process').execFileSync('python3',['scripts/sanitize-voice-trace.py',path.join(out,viewport.name+'-trace.zip')],{input:secret});
  await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({actualQwen:false,actualModelTts:false,fixtureOnly:true,results,videoAudio:'Play separate actual-answer.wav alongside silent browser video; Playwright does not record audio.',physicalIphoneVerified:false},null,2));
 console.log('2/2 speech Chromium regression journeys passed (stubbed inference, prerecorded decoder probe, NOT real provider acceptance).');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
