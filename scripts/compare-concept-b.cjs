const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
const out='artifacts/concept-b/comparison';fs.mkdirSync(out,{recursive:true});
(async()=>{let browser;try{
 browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.TRADEFLOW_ORB_ORIGIN||'http://127.0.0.1:8080'));await page.waitForFunction(()=>window.TradeFlowPilot);
 await page.evaluate(async()=>{const q=indexedDB.open('tradeflow-lite-v1');const db=await new Promise(r=>q.onsuccess=()=>r(q.result));const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'business',company:'Synthetic Reference QA',primaryTrade:'Electrical'});await new Promise(r=>tx.oncomplete=r);db.close()});
 await page.reload();await page.waitForFunction(()=>TradeFlowConceptBOrb.stats()?.ready);
 await page.addStyleTag({content:'.tf-ai-orb[data-orb-material]{width:420px!important;height:408px!important;right:30px!important;bottom:60px!important}'});await page.waitForTimeout(200);
 for(let i=0;i<18;i++){
 const png=await page.evaluate(i=>{TradeFlowConceptBOrb.renderAt(i*.085,0,true);return document.querySelector('.tf-orb-concept-b-canvas').toDataURL().split(',')[1]},i);
 fs.writeFileSync(`${out}/render-${String(i).padStart(2,'0')}.png`,Buffer.from(png,'base64'));
 }
 for(const [name,t] of [['loop-before',1.53-.001],['loop-after',.001]]){
 const png=await page.evaluate(t=>{TradeFlowConceptBOrb.renderAt(t,0,true);return document.querySelector('.tf-orb-concept-b-canvas').toDataURL().split(',')[1]},t);
 fs.writeFileSync(`${out}/${name}.png`,Buffer.from(png,'base64'));
 }
 // Genuine event contract with injected test features: validates plumbing only.
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{window.qaSpeech=setInterval(()=>dispatchEvent(new CustomEvent('tradeflow:speech-features',{detail:{version:1,source:'assistant_playback',active:true,rms:.15,peak:.5}})),60)});
 await page.waitForTimeout(650);assert.ok((await page.evaluate(()=>TradeFlowConceptBOrb.stats().activity))>.5);
 await page.evaluate(()=>clearInterval(window.qaSpeech));await page.waitForTimeout(2000);assert.ok((await page.evaluate(()=>TradeFlowConceptBOrb.stats().activity))<.05);
 const context=await page.locator('canvas.tf-orb-concept-b-canvas').evaluate(c=>!!c.getContext('webgl'));
 assert.ok(context,'WebGL reference transport must initialize');
 assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync(out+'/browser-checks.json',JSON.stringify({checks:['18 phase captures including 8→0 interpolation','injected analyser raises activity','stale analyser decays to idle','WebGL initializes','no page errors'],stats:await page.evaluate(()=>TradeFlowConceptBOrb.stats())},null,2));
 }finally{await browser?.close()}})().catch(e=>{console.error(e);process.exit(1)});
