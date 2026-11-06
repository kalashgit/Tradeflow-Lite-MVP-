/* Actual existing UI navigation, synthetic local settings only. */
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
let browser;const out='artifacts/master-style';fs.mkdirSync(out,{recursive:true});
(async()=>{browser=await chromium.launch({args:['--no-sandbox']});const results=[];
for(const width of [360,390,430,1280]){const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1}),p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(process.env.TRADEFLOW_ORB_ORIGIN||'http://127.0.0.1:8082');await p.waitForFunction(()=>TradeFlowPilot);await p.evaluate(async()=>{const q=indexedDB.open('tradeflow-lite-v1'),db=await new Promise(r=>q.onsuccess=()=>r(q.result)),tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'business',company:'Synthetic Master Style QA',primaryTrade:'Electrical',categories:['Electrical']});await new Promise(r=>tx.oncomplete=r);db.close()});await p.reload();await p.locator('.tf-home-finance').waitFor();
assert.equal(await p.locator('.tf-unified-wordmark').textContent(),'TRADEFLOW');assert.equal(await p.locator('.tf-unified-wordmark .tf-brand-flow').evaluate(e=>getComputedStyle(e).color),'rgb(0, 220, 231)');assert.ok(await p.locator('.tf-home-logo img').evaluate(i=>i.complete&&i.naturalWidth>0));
for(const tab of ['dashboard','customers','quotes','jobs','calendar','settings','preferences']){
 if(tab!=='dashboard'){
 let target=p.locator(`[data-tab="${tab}"]:visible`).first();if(!await target.count()){await p.locator('[data-tab="settings"]:visible').first().click();target=p.locator(`[data-tab="${tab}"]:visible`).first()}
 await target.click();await p.waitForTimeout(250);
 }
 const canvas=await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);assert.equal(canvas,'rgb(5, 5, 5)',tab+' uses Home master canvas');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,tab+' overflow');
 await p.screenshot({path:`${out}/${tab}-${width}.png`});
 results.push({width,tab,canvas});
}
await p.locator('.tf-ai-orb').click();await p.locator('.tf-voice-sheet').waitFor();assert.equal(await p.locator('.tf-voice-sheet').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(8, 11, 12)');await p.screenshot({path:`${out}/intelligence-${width}.png`});assert.deepEqual(errors,[]);await ctx.close();}
fs.writeFileSync(out+'/checks.json',JSON.stringify(results,null,2));console.log('PASS: master Home palette, brand split, navigation and no overflow at 360/390/430/1280; Intelligence surface matches');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>browser?.close());
