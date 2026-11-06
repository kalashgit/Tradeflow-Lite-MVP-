const {chromium}=require('playwright');
const fs=require('fs');const {execFileSync}=require('node:child_process');const assert=require('node:assert/strict');
const out='artifacts/concept-b';fs.mkdirSync(out,{recursive:true});
let browser;
(async()=>{
browser=await chromium.launch({args:['--no-sandbox']});
const results=[];
for(const width of [360,390,430,1280]){
const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width<850?2:1});const p=await ctx.newPage();
await p.goto((process.env.TRADEFLOW_ORB_ORIGIN||'http://127.0.0.1:8080'));await p.waitForFunction(()=>!!window.TradeFlowPilot);
await p.evaluate(async()=>{const q=indexedDB.open('tradeflow-lite-v1');const db=await new Promise(r=>q.onsuccess=()=>r(q.result));const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'business',company:'Synthetic Orb QA',primaryTrade:'Electrical',categories:['Electrical']});await new Promise(r=>tx.oncomplete=r);db.close()});
await p.reload();await p.locator('.tf-orb-concept-b-canvas').waitFor();await p.waitForTimeout(1800);
await p.screenshot({path:`${out}/home-${width}.png`});
const before=await p.locator('canvas.tf-orb-concept-b-canvas').evaluate(c=>c.toDataURL());
await p.waitForTimeout(250);
assert.notEqual(before,await p.locator('canvas.tf-orb-concept-b-canvas').evaluate(c=>c.toDataURL()));
await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(100);
const still=await p.locator('canvas.tf-orb-concept-b-canvas').evaluate(c=>c.toDataURL());await p.waitForTimeout(150);
assert.equal(still,await p.locator('canvas.tf-orb-concept-b-canvas').evaluate(c=>c.toDataURL()));
await p.emulateMedia({reducedMotion:'no-preference'});
const stats=await p.evaluate(()=>TradeFlowConceptBOrb.stats());
const sorted=stats.paintMs.slice().sort((a,b)=>a-b);
results.push({width,measuredFps:1000/(stats.frameIntervals.reduce((a,b)=>a+b,0)/stats.frameIntervals.length),backend:stats.backend,dpr:width<850?2:1,quality:stats.quality,frames:stats.frames,paintMeanMs:sorted.reduce((a,b)=>a+b,0)/sorted.length,paintP95Ms:sorted[Math.floor(sorted.length*.95)],checks:'idle changes; reduced motion freezes; tap opens existing overlay'});
await p.locator('.tf-ai-orb').click();await p.waitForFunction(()=>TradeFlowConceptBOrb.surfaces().some(s=>s.host.includes('tf-voice-wave')&&s.stats.ready));await p.waitForTimeout(500);assert.ok(await p.locator('.tf-voice-sheet').isVisible(),'tap opens existing Intelligence voice sheet');await p.screenshot({path:`${out}/intelligence-${width}.png`});
await p.locator('.tf-voice-sheet [data-voice="close"]').click();await p.locator('.tf-voice-sheet').waitFor({state:'detached'});await p.waitForFunction(()=>TradeFlowConceptBOrb.surfaces().length===1&&TradeFlowConceptBOrb.stats()?.ready);
if(width===1280){
await p.reload();await p.locator('.tf-orb-concept-b-canvas').waitFor();await p.waitForTimeout(500);
await p.addStyleTag({content:'.tf-ai-orb[data-orb-material]{width:420px!important;height:408px!important;right:30px!important;bottom:60px!important}'});
await p.evaluate(()=>TradeFlowConceptBOrb.resetStats());await p.waitForTimeout(2000);results.push({referenceScale:true,stats:await p.evaluate(()=>TradeFlowConceptBOrb.stats())});await p.screenshot({path:`${out}/reference-scale.png`,clip:{x:830,y:432,width:420,height:408}});
for(const mode of ['idle','SIMULATED-speaking']){
const recording=await browser.newContext({storageState:await ctx.storageState({indexedDB:true}),viewport:{width:1280,height:900},recordVideo:{dir:out,size:{width:1280,height:900}}});
const page=await recording.newPage();await page.goto((process.env.TRADEFLOW_ORB_ORIGIN||'http://127.0.0.1:8080'));await page.locator('.tf-ai-orb').waitFor();
await page.addStyleTag({content:'.tf-ai-orb[data-orb-material]{width:420px!important;height:408px!important;right:30px!important;bottom:60px!important}'});
await page.evaluate(mode=>{const label=document.createElement('div');label.textContent=mode==='idle'?'IDLE — synthetic QA workspace':'SIMULATED SPEAKING — injected test features, no real audio';label.style='position:fixed;top:10px;left:10px;z-index:999999;color:white;background:black;padding:12px';document.body.append(label);if(mode!=='idle')window.qaTimer=setInterval(()=>dispatchEvent(new CustomEvent('tradeflow:speech-features',{detail:{version:1,source:'assistant_playback',active:true,rms:.12+.07*Math.sin(performance.now()/240),peak:.5}})),80)},mode);
await page.waitForTimeout(15000);const video=page.video();await recording.close();await video.saveAs(`${out}/${mode}.webm`);
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-sseof','-15','-i',`${out}/${mode}.webm`,'-an','-t','15','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-crf','32','-b:v','0',`${out}/${mode}-trim.webm`]);fs.renameSync(`${out}/${mode}-trim.webm`,`${out}/${mode}.webm`);
}
}
await ctx.close();
}
fs.writeFileSync(out+'/metrics.json',JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>browser?.close());
