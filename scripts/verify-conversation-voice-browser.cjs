// CI-only synthetic integration regression; see verify-conversation-voice.cjs for actual providers.
// Real microphone-capture code, actual local ASR/Qwen/TTS. Chromium device input is
// synthetic Piper speech, NOT a live human microphone or physical-iPhone acceptance.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const {createPreviewServer}=require('./local-ai-preview-server.cjs');
const {createLocalTtsProvider}=require('../src/local-tts-provider.cjs');
const {createLocalAsrProvider}=require('../src/local-asr-provider.cjs');
const out=path.resolve('artifacts/voice-01/conversation-regression');fs.mkdirSync(out,{recursive:true});
(async()=>{
 let enabled=true,asrCalls=0;
 const probe=fs.readFileSync(path.resolve('tests/fixtures/voice/playback-probe.wav'));
 // Decoder-probe audio is fixed; ASR and inference are EXPLICIT STUBS in this CI test.
 const inputFrames=probe.readUInt32LE(40)/2,inputRate=probe.readUInt32LE(24),duration=inputFrames/inputRate;
 const samples=Math.ceil((duration+12)*48000),mic=Buffer.alloc(44+samples*2);probe.copy(mic,0,0,44);
 mic.writeUInt32LE(mic.length-8,4);mic.writeUInt32LE(48000,24);mic.writeUInt32LE(96000,28);mic.writeUInt32LE(samples*2,40);
 for(let i=0;i<duration*48000;i++){const at=Math.min(inputFrames-1,Math.floor(i*inputRate/48000));mic.writeInt16LE(probe.readInt16LE(44+at*2),44+i*2)}
 const micPath=path.join(out,'synthetic-microphone.wav');fs.writeFileSync(micPath,mic);
 const speechProvider={health:async()=>({ready:true,fixture:true}),synthesize:async(text)=>({audio:probe,provider:'fixture_only',textSha256:crypto.createHash('sha256').update(text).digest('hex')})};
 const asrProvider={health:async()=>({ready:true,fixture:true}),transcribe:async()=>{if(!enabled)throw Object.assign(Error('Model missing'),{status:503});return {text:++asrCalls%2?'Give two ways an electrician can reduce return trips.':'What should I put on that material checklist?',confidence:'model_transcript_unverified'}}};
 const secret=crypto.randomBytes(24).toString('base64url');const {server,metrics}=createPreviewServer({secret,mode:'live',speechProvider,asrProvider,localFetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:'TradeFlow is ready. What would you like to review?'},finish_reason:'stop'}]})})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({args:['--no-sandbox','--autoplay-policy=user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+micPath]});
 const results=[];
 try{
 for(const viewport of [{width:390,height:844,name:'mobile'},{width:1280,height:900,name:'desktop'}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',permissions:['microphone'],recordVideo:{dir:out,size:{width:viewport.width,height:viewport.height}}});await context.tracing.start({screenshots:true,snapshots:true});const page=await context.newPage();
  await context.addInitScript(()=>{window.__micTracks=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await original(options);window.__micTracks.push(...stream.getTracks());return stream}});
  const responses=[],transcripts=[];page.on('response',async response=>{
   if(response.url().endsWith('/api/ai/speech/recognize')){const value=await response.json().catch(()=>null);if(value)transcripts.push(value)}
   if(response.url().endsWith('/api/ai/speech/synthesize')&&response.status()===200){const audio=await response.body().catch(()=>null);if(audio){const file=viewport.name+'-reply-'+(responses.length+1)+'.wav';fs.writeFileSync(path.join(out,file),audio);responses.push({file,sha256:crypto.createHash('sha256').update(audio).digest('hex')})}}
  });
  await page.goto(url);await page.waitForFunction(()=>!!window.TradeFlowPilot);
  await page.evaluate(async()=>{const r=indexedDB.open('tradeflow-lite-v1');const db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'business',company:'Synthetic Spoken Conversation',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true});await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=j});db.close()});
  await page.reload();await page.locator('[data-tab="settings"]:visible').first().click();await page.locator('.tf-more-menu [data-tab="ai"]').click();await page.locator('#tfAiUnlockForm input').fill(secret);await page.locator('#tfAiUnlockForm button').click();await page.waitForFunction(()=>sessionStorage.getItem('tf-local-voice-enabled')==='1');
  await page.evaluate(()=>{window.__voiceStates=[];window.addEventListener('tradeflow:voice-state',e=>window.__voiceStates.push({status:e.detail.status,transcript:e.detail.transcript,at:performance.now()}))});
  await page.locator('[data-voice-start]').click();await page.waitForFunction(()=>window.TradeFlowConversationVoice.getState().status==='listening').catch(async error=>{console.error('Voice startup:',await page.evaluate(()=>({state:window.TradeFlowConversationVoice.getState(),events:window.__voiceStates})));throw error});
  await page.waitForFunction(()=>window.__voiceStates.some(s=>s.status==='speaking'),null,{timeout:90000});
  assert.ok(transcripts.length>=1);assert.match(transcripts[0].text,/electrician|return trips/i);
  await page.screenshot({path:path.join(out,viewport.name+'-speaking.png'),fullPage:true});
  const firstThread=await page.locator('#tfAiThreadPicker').inputValue();
  // Keep the opted-in microphone foregrounded: the second actual audio phrase is
  // recognized into the SAME thread without another activation or scripted answer.
  await page.waitForFunction(()=>window.__voiceStates.filter(s=>s.status==='speaking').length>=2,null,{timeout:100000});
  assert.equal(await page.locator('#tfAiThreadPicker').inputValue(),firstThread);assert.ok(transcripts.length>=2);assert.match(transcripts[1].text,/material|checklist/i);
  await page.locator('[data-voice-stop]').click();assert.equal(await page.evaluate(()=>window.TradeFlowConversationVoice.getState().status),'idle');assert.equal(await page.evaluate(()=>window.TradeFlowSpeech.getState().status),'idle');
  assert.equal(await page.evaluate(()=>window.__micTracks.every(t=>t.readyState==='ended')),true,'Stop releases actual capture tracks');
  const turns=await page.evaluate(async thread=>{const r=indexedDB.open('tradeflow-lite-v1');const db=await new Promise(resolve=>{r.onsuccess=()=>resolve(r.result)});const turns=await window.TradeFlowConversationStore.listTurns(db,{kind:'local',businessId:'local-business',actorId:'local-owner'},thread);db.close();return turns.map(({id,role,modality,status,content})=>({id,role,modality,status,content}))},firstThread);
  assert.equal(turns.filter(t=>t.role==='user'&&t.modality==='voice').length,2);assert.equal(turns.filter(t=>t.role==='assistant').length,2);assert.equal(new Set(turns.map(t=>t.id)).size,4);assert.equal(metrics.writes,0);
  const observedStates=await page.evaluate(()=>window.__voiceStates);
  // Real browser Permissions-Policy denial, provider failure and offline capture cleanup.
  await page.route(url+'/',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'Permissions-Policy':'microphone=()'}})});
  await page.reload();await page.locator('[data-tab="settings"]:visible').first().click();await page.locator('.tf-more-menu [data-tab="ai"]').click();
  await page.locator('[data-voice-start]').click();await page.waitForFunction(()=>window.TradeFlowConversationVoice.getState().status==='unavailable');
  assert.match(await page.locator('[data-conversation-voice] [role=status]').innerText(),/permission denied/);
  await page.unroute(url+'/');await page.reload();await page.locator('[data-tab="settings"]:visible').first().click();await page.locator('.tf-more-menu [data-tab="ai"]').click();
  enabled=false;await page.locator('[data-voice-start]').click();await page.waitForFunction(()=>window.TradeFlowConversationVoice.getState().status==='unavailable');
  assert.equal(await page.evaluate(()=>window.__micTracks.every(t=>t.readyState==='ended')),true);enabled=true;
  await context.setOffline(true);await page.locator('[data-voice-start]').click();await page.waitForFunction(()=>window.TradeFlowConversationVoice.getState().status==='unavailable');
  assert.equal(await page.evaluate(()=>window.__micTracks.every(t=>t.readyState==='ended')),true);await context.setOffline(false);
  const states=observedStates;const transcriptAt=states.find(s=>s.status==='transcribing')?.at,speakingAt=states.find(s=>s.status==='speaking')?.at;
  results.push({viewport:viewport.name,actualLocalASR:false,actualQwen:false,actualModelTTS:false,fixtureOnly:true,microphoneSource:'synthetic Piper test speech via Chromium fake device, NOT human',canonicalThread:firstThread,turns,transcripts,audio:responses.slice(),vadEndToFirstWebAudioMs:Math.round(speakingAt-transcriptAt),states,zeroBusinessWrites:true});
  await page.screenshot({path:path.join(out,viewport.name+'-stopped.png'),fullPage:true});await context.tracing.stop({path:path.join(out,viewport.name+'-trace.zip')});require('node:child_process').execFileSync('python3',['scripts/sanitize-voice-trace.py',path.join(out,viewport.name+'-trace.zip')],{input:secret});await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:1,physicalDeviceVerified:false,humanSpeechAccuracyVerified:false,results},null,2));
 console.log('2/2 actual microphone/browser lifecycle regressions passed; ASR/model STUBS and prerecorded decoder probe, NOT real provider acceptance.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
