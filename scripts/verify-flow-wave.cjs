/* Run against the actual app: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/verify-flow-wave.cjs.
   Synthetic recognition holds the listening state; this does not test hardware/transcription. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.OUTPUT_DIR||'/tmp/tradeflow-flow-wave';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const results=[];
 for(const engine of (process.env.BROWSERS||'chromium,webkit').split(',')){
  const browser=await pw[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await page.addInitScript(()=>{window.SpeechRecognition=class{start(){}stop(){this.onend?.()}abort(){}}});
   await page.goto(process.env.BASE_URL||'http://127.0.0.1:4190/');
   await page.waitForFunction(()=>!!window.TradeFlowVoice);
   // Isolated browser profile only; never seed fake customer, job or financial records.
   await page.evaluate(async()=>{
    const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise(r=>q.onsuccess=()=>r(q.result));
    const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'business',company:'Visual verification',primaryTrade:'Electrical'});
    await new Promise(r=>tx.oncomplete=r);db.close();
   });
   await page.reload();await page.waitForFunction(()=>!!window.TradeFlowVoice);
   await page.evaluate(()=>window.TradeFlowVoice.startListening());
   await page.locator('.tf-flow-art').waitFor();
   for(const [width,height]of [[375,812],[390,844],[430,932],[375,568],[390,360]]){
    await page.setViewportSize({width,height});
    const geometry=await page.evaluate(()=>{
     const svg=document.querySelector('.tf-flow-art'),r=svg.getBoundingClientRect();
     return {width:r.width,height:r.height,paths:svg.querySelectorAll('path').length,animation:getComputedStyle(svg.querySelector('.tf-flow-sheet')).animationName};
    });
    assert.equal(geometry.paths,4);assert.ok(geometry.width>300);assert.ok(geometry.height>=160);
    assert.equal(geometry.animation,'none');
    await page.screenshot({path:path.join(out,engine+'-'+width+'x'+height+'.png')});
    results.push({engine,width,height,...geometry});
   }
   await page.setViewportSize({width:390,height:844});
   const wave=page.locator('.tf-voice-wave');
   await page.emulateMedia({reducedMotion:'no-preference'});
   for(const [state,name]of [['is-idle','tfSilkIdle'],['is-listening','tfSilkListening'],['is-processing','tfSilkProcessing']]){
    await wave.evaluate((el,state)=>el.className='tf-voice-wave '+state,state);
    assert.equal(await wave.locator('.tf-flow-sheet').first().evaluate(el=>getComputedStyle(el).animationName),name);
    const before=await wave.locator('.tf-flow-sheet').first().evaluate(el=>getComputedStyle(el).transform);
    await page.waitForTimeout(200);
    const after=await wave.locator('.tf-flow-sheet').first().evaluate(el=>getComputedStyle(el).transform);
    assert.notEqual(before,after,engine+' '+state+' should move');
   }
   await page.emulateMedia({reducedMotion:'reduce'});
   await wave.evaluate(el=>el.className='tf-voice-wave is-listening');
   const rect=await wave.boundingBox(),height=rect.width*238/640;
   await page.screenshot({path:path.join(out,engine+'-wave.png'),clip:{x:rect.x,y:rect.y+(rect.height-height)/2,width:rect.width,height}});
   await page.screenshot({path:path.join(out,engine+'-390x844.png')});
   assert.equal(await page.locator('#tfVoiceText').isEditable(),true);
   results.push({engine,motionStates:3,reducedMotion:'passed',typedInput:'editable',hardwareMicrophone:'not tested'});
  }finally{await browser.close()}
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));
 console.log('PASS: '+(process.env.BROWSERS||'chromium,webkit')+'; five viewport sizes each; three motion states; reduced motion; typed input.');
})().catch(e=>{console.error(e);process.exitCode=1});
