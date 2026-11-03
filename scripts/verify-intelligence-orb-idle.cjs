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
 for(const [width,motion] of [[390,'no-preference'],[390,'reduce'],[1280,'no-preference']]){
  const recording=width===390&&motion==='no-preference';
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:motion,...(recording?{recordVideo:{dir:out,size:{width:390,height:844}}}:{})});
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
   await page.locator('.tf-ai-orb[data-orb-material="fine-mesh-v1"]').waitFor();
   await page.waitForTimeout(350);
   const orb=page.locator('.tf-ai-orb');
   assert.equal(await orb.locator('canvas.tf-orb-mesh').count(),1);
   assert.equal(await orb.getAttribute('data-action'),'tfAiToggle');
   assert.equal(await orb.locator('.tf-ai-orb-icon').evaluate(e=>getComputedStyle(e).display),'none');
   const widthRendered=await orb.evaluate(e=>e.getBoundingClientRect().width);
   assert.ok(widthRendered>=60&&widthRendered<=76);
   const before=await page.locator('.tf-orb-mesh').evaluate(c=>c.toDataURL('image/png'));
   await page.waitForTimeout(1300);
   const after=await page.locator('.tf-orb-mesh').evaluate(c=>c.toDataURL('image/png'));
   if(motion==='reduce')assert.equal(before,after,'reduced-motion orb must stay still');
   else assert.notEqual(before,after,'living mesh must move between frames');
   await page.screenshot({path:out+'/tradeflow-orb-'+width+'-'+motion+'.png',fullPage:true});
   if(recording){await orb.screenshot({path:out+'/tradeflow-orb-mesh-detail.png'});await page.waitForTimeout(3500)}
   await orb.click();
   await page.locator('.tf-voice-sheet').waitFor();
   assert.equal(await page.locator('.tf-voice-sheet #tfVoiceText').count(),1,'existing voice sheet text input must remain reachable');
   assert.equal(await page.locator('.tf-ai-orb .tf-orb-mesh').count(),1,'orb stays attached with panel open');
   await page.screenshot({path:out+'/tradeflow-orb-panel-'+width+'-'+motion+'.png'});
   await page.locator('.tf-voice-sheet [data-voice="close"]').click();
   await page.locator('.tf-voice-sheet').waitFor({state:'detached'});
   assert.equal(await page.locator('.tf-ai-orb .tf-orb-mesh').count(),1,'no leaked/duplicated canvases after panel toggle');
   assert.deepEqual(exceptions,[],'no uncaught application errors');
   console.log('PASS: current TradeFlow app orb '+width+' '+motion+' with real canvas motion, original composer and lifecycle');
  }finally{
   await context.tracing.stop({path:out+'/tradeflow-orb-trace-'+width+'-'+motion+'.zip'});
   const video=page.video();
   await context.close();
   if(recording&&video)await video.saveAs(out+'/tradeflow-live-orb-idle-390.webm');
  }
 }
})().catch(err=>{console.error(err);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
