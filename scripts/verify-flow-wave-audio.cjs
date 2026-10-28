/* Browser integration test: synthetic microphone samples through real getUserMedia/Web Audio.
   This verifies audio-driven rendering, not physical speech recognition or iPhone compatibility. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.OUTPUT_DIR||'/tmp/flow-wave-audio';fs.mkdirSync(out,{recursive:true});
const rate=48000,seconds=8,wav=Buffer.alloc(44+rate*seconds*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
for(let i=0;i<rate*seconds;i++){
 const t=i/rate,section=Math.floor(t)%4,amplitude=[0,.2,.04,0][section];
 const syllable=.65+.35*Math.sin(t*2*Math.PI*3),sample=amplitude*syllable*(Math.sin(t*2*Math.PI*220)+.35*Math.sin(t*2*Math.PI*660)+.2*Math.sin(t*2*Math.PI*1500));
 wav.writeInt16LE(Math.round(sample*32767),44+i*2);
}
const file=path.join(out,'synthetic-speech-envelope.wav');fs.writeFileSync(file,wav);
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+file],...(process.env.BROWSER_PROXY?{proxy:{server:process.env.BROWSER_PROXY}}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference',recordVideo:{dir:out,size:{width:390,height:844}}});
 try{
  const page=await context.newPage();
  await page.addInitScript(()=>{
   window.SpeechRecognition=class{start(){}stop(){this.onend?.()}abort(){}};
   window.testStreams=[];
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async options=>{const stream=await original(options);window.testStreams.push(stream);return stream};
  });
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:4190/');await page.waitForFunction(()=>!!window.TradeFlowVoice);
  await page.evaluate(async()=>{const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result)),tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'business',company:'Isolated audio verification',primaryTrade:'Electrical'});await new Promise(r=>tx.oncomplete=r);db.close()});
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowVoice);
  await page.evaluate(()=>window.TradeFlowVoice.start());
  await page.locator('[data-voice="mic"]').click();
  await page.locator('.tf-voice-wave.is-audio-reactive').waitFor();
  const samples=[];
  for(let i=0;i<65;i++){
   samples.push(await page.locator('.tf-flow-sheet-cyan').evaluate(el=>({time:performance.now(),transform:el.style.transform})));
   if(i===5||i===25)await page.screenshot({path:path.join(out,'audio-'+i+'.png')});
   await page.waitForTimeout(100);
  }
  const scale=s=>Number(s.transform.match(/scaleY\(([^)]+)/)?.[1]);
  const scales=samples.map(scale);assert.ok(Math.max(...scales)>1.03,'Voiced samples should expand the ribbons');
  assert.ok(Math.min(...scales)<1.005,'Silence should settle to reference scale');
  assert.ok(new Set(samples.map(s=>s.transform)).size>20,'Meter should continuously track the signal');
  await page.locator('[data-voice="mic"]').click();
  assert.equal(await page.locator('.is-audio-reactive').count(),0);
  const ended=await page.evaluate(()=>window.testStreams.length>0&&window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));assert.equal(ended,true,'Stop should release added microphone tracks');
  const result={source:'synthetic microphone WAV through real browser getUserMedia and AnalyserNode; no physical microphone or speech recognizer tested',samples,range:{min:Math.min(...scales),max:Math.max(...scales)},stopReleasesTracks:ended};
  fs.writeFileSync(path.join(out,'audio-results.json'),JSON.stringify(result,null,2));
  console.log('PASS: real Web Audio signal drives ribbons, silence settles, Stop releases microphone.');
 }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
