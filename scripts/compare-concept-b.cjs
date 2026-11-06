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
 // Compare light/color on the SAME phase, outside the protected T.
 const lighting=await page.evaluate(()=>{
  const canvas=document.querySelector('.tf-orb-concept-b-canvas'),gl=canvas.getContext('webgl');
  function sample(energy){TradeFlowConceptBOrb.renderAt(.34,energy);const a=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);let blue=0,green=0,n=0;
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const r=Math.hypot(x/canvas.width-.5,y/canvas.height-.5);if(r<.24||r>.46)continue;const p=(y*canvas.width+x)*4;blue+=a[p+2];green+=a[p+1];n++;}return {blue:blue/n,green:green/n};}
  return {idle:sample(0),speaking:sample(.8)};
 });
 assert.ok(lighting.speaking.blue>lighting.idle.blue*1.8,'speaking is visibly brighter blue');
 assert.ok(lighting.speaking.green/lighting.speaking.blue<lighting.idle.green/lighting.idle.blue,'membrane shifts toward blue');
 // Genuine event contract with injected test features: validates plumbing only.
 await page.emulateMedia({reducedMotion:'no-preference'});
 const cadence=await page.evaluate(async()=>{await new Promise(requestAnimationFrame);const start=TradeFlowConceptBOrb.stats().time,wall=performance.now();await new Promise(r=>setTimeout(r,1000));await new Promise(requestAnimationFrame);const stats=TradeFlowConceptBOrb.stats();return {rate:(stats.time-start)/((performance.now()-wall)/1000),stats}});assert.ok(cadence.rate>.9&&cadence.rate<1.1,'idle follows GIF timing at real-time speed: '+JSON.stringify({cadence,errors}));
 await page.locator('.tf-ai-orb canvas').evaluate(c=>c.remove());await page.waitForFunction(()=>TradeFlowConceptBOrb.stats()?.ready&&document.querySelectorAll('.tf-ai-orb canvas').length===1);const recovered=await page.evaluate(()=>TradeFlowConceptBOrb.stats().frames);await page.waitForTimeout(150);assert.ok((await page.evaluate(()=>TradeFlowConceptBOrb.stats().frames))>recovered,'canvas replacement recovers live motion');
 await page.evaluate(()=>{window.qaSpeech=setInterval(()=>dispatchEvent(new CustomEvent('tradeflow:speech-features',{detail:{version:1,source:'assistant_playback',active:true,rms:.15,peak:.5}})),60)});
 await page.waitForTimeout(800);assert.ok((await page.evaluate(()=>TradeFlowConceptBOrb.stats().activity))>.5);assert.ok((await page.evaluate(()=>TradeFlowConceptBOrb.stats().motionSpeed))<.22,'speech settles motion');
 await page.evaluate(()=>clearInterval(window.qaSpeech));await page.waitForTimeout(2000);assert.ok((await page.evaluate(()=>TradeFlowConceptBOrb.stats().activity))<.05);assert.ok((await page.evaluate(()=>TradeFlowConceptBOrb.stats().motionSpeed))>.52,'idle movement returns smoothly');
 const context=await page.locator('canvas.tf-orb-concept-b-canvas').evaluate(c=>!!c.getContext('webgl'));
 assert.ok(context,'WebGL reference transport must initialize');
 assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync(out+'/browser-checks.json',JSON.stringify({lighting,checks:['real-time GIF cadence','canvas replacement recovers motion','18 phase captures including 8→0 interpolation','injected analyser raises blue brightness and slows motion','stale analyser decays to idle','WebGL initializes','no page errors'],stats:await page.evaluate(()=>TradeFlowConceptBOrb.stats())},null,2));
 }finally{await browser?.close()}})().catch(e=>{console.error(e);process.exit(1)});
