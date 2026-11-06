/* Actual Home-size review. Injected test speech is explicitly labeled. */
const {chromium}=require('playwright'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const out='artifacts/concept-b';fs.mkdirSync(out,{recursive:true});let browser;
(async()=>{
 browser=await chromium.launch({args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:900},deviceScaleFactor:2,recordVideo:{dir:out,size:{width:390,height:900}}});const p=await ctx.newPage();
 await p.goto(process.env.TRADEFLOW_ORB_ORIGIN||'http://127.0.0.1:8080');await p.waitForFunction(()=>TradeFlowPilot);
 await p.evaluate(async()=>{const q=indexedDB.open('tradeflow-lite-v1');const db=await new Promise(r=>q.onsuccess=()=>r(q.result));const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'business',company:'Synthetic Compact Orb Review',primaryTrade:'Electrical',categories:['Electrical']});await new Promise(r=>tx.oncomplete=r);db.close()});
 await p.reload();await p.waitForFunction(()=>TradeFlowConceptBOrb.stats()?.ready);
 await p.evaluate(()=>{const l=document.createElement('div');l.id='qa-state';l.textContent='IDLE · DIM BLUE';l.style='position:fixed;left:12px;bottom:100px;z-index:10000;padding:8px;background:#09131e;color:#cdefff;font:11px system-ui;border:1px solid #193749;border-radius:8px';document.body.append(l)});
 await p.waitForTimeout(1000);await p.screenshot({path:out+'/compact-idle.png'});await p.waitForTimeout(4000);
 await p.evaluate(()=>{document.getElementById('qa-state').textContent='SIMULATED ASSISTANT SPEECH';window.qaSpeech=setInterval(()=>dispatchEvent(new CustomEvent('tradeflow:speech-features',{detail:{version:1,source:'assistant_playback',active:true,rms:.14+.025*Math.sin(performance.now()/260),peak:.45}})),60)});
 await p.waitForTimeout(1000);await p.screenshot({path:out+'/compact-speaking.png'});await p.waitForTimeout(6000);
 await p.evaluate(()=>{clearInterval(window.qaSpeech);dispatchEvent(new CustomEvent('tradeflow:speech-features',{detail:{version:1,source:'assistant_playback',active:false}}));document.getElementById('qa-state').textContent='RETURNING TO IDLE'});await p.waitForTimeout(3000);
 const v=p.video();await ctx.close();await v.saveAs(out+'/compact-home-review.webm');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-sseof','-15','-i',out+'/compact-home-review.webm','-t','15','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',out+'/compact-home-review.mp4']);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>browser?.close());
