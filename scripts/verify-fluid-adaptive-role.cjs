/* TF-GUI-014 / F01: real Chromium adaptation fixture in the existing app.
 * Only DOM-simulated route counts; NOT authenticated role/tenant acceptance.
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve('public'),out='artifacts/fluid-adaptive-review';
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://test'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return}
 fs.readFile(file,(error,bytes)=>{
  if(error){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
  res.end(bytes);
 });
});
let browser,context;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.tracing.start({screenshots:true,snapshots:true});
 try{
  const port=server.address().port;
  await page.goto('http://127.0.0.1:'+port);
  await page.waitForFunction(()=>!!window.TradeFlowPilot);
  // Same disposable synthetic setup used by existing GUI Chromium verifier.
  await page.evaluate(async()=>{
   const q=indexedDB.open('tradeflow-lite-v1'),db=await new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});
   const t=db.transaction('settings','readwrite');
   t.objectStore('settings').put({id:'business',company:'Synthetic role navigation QA',primaryTrade:'Electrical',categories:['Electrical']});
   await new Promise((res,rej)=>{t.oncomplete=res;t.onerror=()=>rej(t.error)});
   db.close();
  });
  await page.reload();
  await page.locator('.tf-home-stats').waitFor();
  await page.locator('.mobilebar.tf-fluid-nav').waitFor();
  assert.equal(await page.locator('.mobilebar button[data-tab]').count(),5);
  // Do not pretend to sign in as anyone. Modify only the rendered test DOM.
  await page.evaluate(()=>{
   const nav=document.querySelector('.mobilebar');
   [...nav.querySelectorAll('button[data-tab]')].slice(3).forEach(button=>button.remove());
  });
  await page.waitForFunction(()=>document.querySelector('.mobilebar')?.dataset.fluidAdaptive==='true');
  assert.equal(await page.locator('.mobilebar button[data-tab]').count(),3);
  assert.equal(await page.locator('.mobilebar.tf-fluid-nav .tf-fluid-capsule').count(),1);
  const columns=await page.locator('.mobilebar').evaluate(nav=>getComputedStyle(nav).gridTemplateColumns.split(' ').filter(Boolean).length);
  assert.equal(columns,3,'three available routes must use three visible columns');
  await page.screenshot({path:out+'/synthetic-3tab-rest.png'});
  // Replace a button in-place during a gesture, as can happen on a role change.
  const first=await page.locator('.mobilebar button').first().boundingBox();
  await page.mouse.move(first.x+first.width/2,first.y+first.height/2);
  await page.mouse.down();
  assert.equal(await page.locator('.mobilebar').getAttribute('data-fluid-dragging'),'true');
  await page.evaluate(()=>{
   const button=document.querySelector('.mobilebar button[data-tab="calendar"]');
   button.replaceWith(button.cloneNode(true));
  });
  await page.waitForFunction(()=>!document.querySelector('.mobilebar')?.hasAttribute('data-fluid-dragging'));
  await page.mouse.up();
  assert.equal(await page.locator('.mobilebar button[data-tab]').count(),3);
  assert.equal(await page.locator('.mobilebar .tf-fluid-capsule').count(),1);
  // Real finger drag across the reduced set, with one existing route action.
  const points=await page.locator('.mobilebar button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}}));
  await page.mouse.move(points[0].x,points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[2].x,points[2].y,{steps:10});
  assert.equal(await page.locator('.mobilebar [data-fluid-candidate]').getAttribute('data-tab'),'calendar');
  await page.screenshot({path:out+'/synthetic-3tab-drag.png'});
  await page.mouse.up();
  await page.locator('.mobilebar button[data-tab="calendar"].active').waitFor();
  // A role may have only one eligible destination.
  await page.evaluate(()=>{
   const nav=document.querySelector('.mobilebar');
   [...nav.querySelectorAll('button[data-tab]')].filter(b=>b.dataset.tab!=='calendar').forEach(b=>b.remove());
  });
  await page.waitForFunction(()=>document.querySelector('.mobilebar')?.dataset.fluidAdaptive==='true'&&document.querySelector('.mobilebar')?.querySelectorAll('button[data-tab]').length===1);
  assert.equal(await page.locator('.mobilebar .tf-fluid-capsule').count(),1);
  await page.screenshot({path:out+'/synthetic-1tab-rest.png'});
  // Zero available destinations must not fabricate a button or a fluid capsule.
  await page.evaluate(()=>document.querySelectorAll('.mobilebar button[data-tab]').forEach(b=>b.remove()));
  await page.waitForFunction(()=>!document.querySelector('.mobilebar')?.classList.contains('tf-fluid-nav'));
  assert.equal(await page.locator('.mobilebar button').count(),0);
  assert.equal(await page.locator('.mobilebar .tf-fluid-capsule').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: actual-app Chromium synthetic 3-tab drag, same-node remount, 1-tab and 0-tab denial');
 }finally{
  await context.tracing.stop({path:out+'/synthetic-adaptive-interaction.zip'});
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>server.close());
