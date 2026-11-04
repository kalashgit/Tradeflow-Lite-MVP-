/* TF-GUI-ORB-IDLE-01: rendered browser acceptance on existing TradeFlow application.
 * Disposable local-origin IndexedDB only; no login, real customer data or cloud write.
 */
const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const base=path.resolve('public'),out='artifacts/orb-idle';
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://local'),file=path.resolve(base,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(base+'/')){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,bytes)=>{
  if(error){res.writeHead(404);res.end();return;}
  const type=({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream';
  res.setHeader('Content-Type',type);res.end(bytes);
 });
});
let browser;
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 browser=await chromium.launch({args:['--no-sandbox']});
 const url='http://127.0.0.1:'+server.address().port;
 for(const [width,motion] of [[360,'no-preference'],[390,'no-preference'],[390,'reduce'],[1280,'no-preference']]){
  const recording=width===390&&motion==='no-preference';
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:width<850?2:1,reducedMotion:motion,...(recording?{recordVideo:{dir:out,size:{width:390,height:844}}}:{})});
  const page=await context.newPage();
  const exceptions=[];page.on('pageerror',e=>exceptions.push(e.message));
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  try{
   await page.goto(url);
   await page.waitForFunction(()=>!!window.TradeFlowPilot);
   await page.evaluate(async()=>{
    const q=indexedDB.open('tradeflow-lite-v1'),db=await new Promise((ok,fail)=>{q.onsuccess=()=>ok(q.result);q.onerror=()=>fail(q.error)});
    const tx=db.transaction('settings','readwrite');
    tx.objectStore('settings').put({id:'business',company:'Synthetic Mesh Orb QA',primaryTrade:'Electrical',categories:['Electrical']});
    await new Promise((ok,fail)=>{tx.oncomplete=ok;tx.onerror=()=>fail(tx.error)});
    db.close();
   });
   await page.reload();
   await page.locator('.tf-ai-orb[data-orb-material="woven-blue-v9"]').waitFor();
   await page.waitForTimeout(350);
   const orb=page.locator('.tf-ai-orb');
   assert.equal(await orb.locator('canvas.tf-orb-mesh').count(),1);
   assert.equal(await orb.getAttribute('data-action'),'tfAiToggle');
   assert.equal(await orb.locator('.tf-ai-orb-icon').evaluate(e=>getComputedStyle(e).display),'none');
   const widthRendered=await orb.evaluate(e=>e.getBoundingClientRect().width);
   assert.ok(widthRendered>=60&&widthRendered<=76);
   const placement=await orb.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
   assert.ok(placement.left>=0&&placement.right<=width+1,'orb must stay within visible viewport');
   if(width<850)assert.ok(placement.bottom<844-65,'orb must sit above footer and safe area');
   const before=await page.locator('.tf-orb-mesh').evaluate(c=>c.toDataURL('image/png'));
   await page.waitForTimeout(1300);
   const after=await page.locator('.tf-orb-mesh').evaluate(c=>c.toDataURL('image/png'));
   if(motion==='reduce')assert.equal(before,after,'reduced-motion orb must stay still');
   else assert.notEqual(before,after,'living mesh must move between frames');
   const material=await page.locator('.tf-orb-mesh').evaluate(canvas=>{
     const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
     const pixels=ctx.getImageData(0,0,w,h).data;
     let count=0,bright=0,totalRed=0,totalBlue=0;
     for(let y=0;y<h;y++)for(let x=0;x<w;x++){
       const nx=(x-w/2)/(w/2),ny=(y-h/2)/(h/2);
       if(nx*nx+ny*ny>.50)continue;
       const p=(y*w+x)*4;
       totalRed+=pixels[p];totalBlue+=pixels[p+2];
       if(pixels[p+2]>92)bright++;
       count++;
     }
     return {meanRed:+(totalRed/count).toFixed(1),meanBlue:+(totalBlue/count).toFixed(1),
       brightFraction:+(bright/count).toFixed(3),pixels:count};
   });
   console.log('TF-MI-ORB-01 native material '+width+' '+motion+' '+JSON.stringify(material));
   await page.screenshot({path:out+'/tradeflow-orb-'+width+'-'+motion+'.png',fullPage:true});
   if(width===360)await orb.screenshot({path:out+'/tradeflow-orb-360-native.png'});
   assert.ok(material.meanBlue>material.meanRed*1.55,'founder palette must remain recognizably blue');
   assert.ok(material.brightFraction>.10,'fine blue strands must remain visible at native phone size');
   if(recording){
     await orb.screenshot({path:out+'/tradeflow-orb-mesh-detail.png'});
     // Material study from the IDENTICAL production renderer, at a larger
     // comparison raster, not a separate invented design or demo app.
     for(const t of [5,14]){
       const encoded=await page.evaluate(time=>{
         const c=document.createElement('canvas');
         c.getBoundingClientRect=()=>({width:144,height:144});
         const test=window.TradeFlowOrbIdle.createRenderer(c,{root:window,document});
         test.renderAt(time);
         const png=c.toDataURL('image/png');
         test.dispose();
         return png;
       },t);
       fs.writeFileSync(out+'/tradeflow-orb-material-study-'+t+'.png',Buffer.from(encoded.split(',')[1],'base64'));
     }
     // Real in-app recording: >12 seconds of unobscured idle before opening
     // the existing voice sheet. These are browser captures, not mock frames.
     await page.waitForTimeout(4000);
     await orb.screenshot({path:out+'/tradeflow-orb-mesh-t5.png'});
     await page.waitForTimeout(4000);
     await orb.screenshot({path:out+'/tradeflow-orb-mesh-t9.png'});
     await page.waitForTimeout(4700);
     await orb.screenshot({path:out+'/tradeflow-orb-mesh-t14.png'});
   }
   const stats=await page.evaluate(()=>window.TradeFlowOrbIdle?.stats?.());
   assert.ok(stats&&stats.frames>0,'renderer must expose actual measurements');
   assert.ok(Number.isFinite(stats.avgPaintMs)&&Number.isFinite(stats.p95PaintMs));
   if(motion==='reduce')assert.equal(stats.observedFps,0,'reduced motion must not run a paint loop');
   else assert.ok(stats.observedFps>5&&stats.observedFps<=65,'observed cadence must reflect a live animation');
   if(recording)assert.ok(stats.frames>100,'full mobile idle recording must include actual live frames');
   const proof={width,motion,placement,material,stats,recording,device:width<850?'Playwright Chromium mobile viewport DPR2':'Playwright Chromium desktop viewport DPR1'};
   fs.writeFileSync(out+'/performance-'+width+'-'+motion+'.json',JSON.stringify(proof,null,2));
   console.log('TF-MI-ORB-01 rendered measure '+JSON.stringify(proof));
   await orb.click();
   await page.locator('.tf-voice-sheet').waitFor();
   assert.equal(await page.locator('.tf-voice-sheet #tfVoiceText').count(),1,'existing voice sheet text input must remain reachable');
   assert.equal(await page.locator('.tf-ai-orb .tf-orb-mesh').count(),1,'orb stays attached with panel open');
   await page.screenshot({path:out+'/tradeflow-orb-panel-'+width+'-'+motion+'.png'});
   await page.locator('.tf-voice-sheet [data-voice="close"]').click();
   await page.locator('.tf-voice-sheet').waitFor({state:'detached'});
   assert.equal(await page.locator('.tf-ai-orb .tf-orb-mesh').count(),1,'no leaked/duplicated canvases after panel toggle');
   assert.deepEqual(exceptions,[],'no uncaught application errors');
   console.log('PASS: current TradeFlow app orb '+width+' '+motion+' with measured fine-mesh motion, original composer and lifecycle');
  }finally{
   await context.tracing.stop({path:out+'/tradeflow-orb-trace-'+width+'-'+motion+'.zip'});
   const video=page.video();
   await context.close();
   if(recording&&video)await video.saveAs(out+'/tradeflow-live-orb-idle-390.webm');
  }
 }
})().catch(err=>{console.error(err);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
