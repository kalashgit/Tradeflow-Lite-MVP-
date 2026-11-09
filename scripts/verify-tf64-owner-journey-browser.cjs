#!/usr/bin/env node
/* X01: only synthetic, device-local payroll scenario; no production tenant import. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createPreviewServer}=require('./local-ai-preview-server.cjs');
const out=path.resolve('artifacts/tf64-owner-journey');
fs.mkdirSync(out,{recursive:true});

async function readTurns(page){
 return page.evaluate(async()=>{
  const request=indexedDB.open('tradeflow-lite-v1');
  const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  const tx=db.transaction(['aiConversationTurns','aiConversationThreads'],'readonly');
  const turnsRequest=tx.objectStore('aiConversationTurns').getAll();
  const threadsRequest=tx.objectStore('aiConversationThreads').getAll();
  const turns=await new Promise((resolve,reject)=>{turnsRequest.onsuccess=()=>resolve(turnsRequest.result);turnsRequest.onerror=()=>reject(turnsRequest.error)});
  const threads=await new Promise((resolve,reject)=>{threadsRequest.onsuccess=()=>resolve(threadsRequest.result);threadsRequest.onerror=()=>reject(threadsRequest.error)});
  db.close();return {turns,threads};
 });
}
(async()=>{
 const {server}=createPreviewServer({secret:'synthetic-tf64-no-real-credentials',mode:'mock'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  for(const width of [390,1280]){
   const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
   await context.tracing.start({screenshots:true,snapshots:true,sources:true});
   const page=await context.newPage();
   await page.addInitScript(()=>{
    window.__tf64Recognition=null;
    window.SpeechRecognition=class {
     constructor(){window.__tf64Recognition=this}
     start(){} stop(){this.onend?.()} abort(){this.onend?.()}
    };
   });
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.waitForFunction(()=>!!window.TradeFlowPilot);
   await page.evaluate(async()=>{
    const request=indexedDB.open('tradeflow-lite-v1');
    const db=await new Promise(resolve=>request.onsuccess=()=>resolve(request.result));
    const tx=db.transaction('settings','readwrite');
    tx.objectStore('settings').put({id:'business',company:'Synthetic TF64 QA',primaryTrade:'Electrical',categories:['Electrical'],onboardingComplete:true});
    await new Promise(resolve=>tx.oncomplete=resolve);db.close();
   });
   await page.reload();await page.locator('.tf-ai-orb').waitFor();
   await page.waitForFunction(()=>!!window.TradeFlowVoice?.state);
   const orb=page.locator('.tf-ai-orb');
   await orb.click();await page.locator('#tfOrbBubble').waitFor();
   const typed='We have five projects, $87,000 in cash, $245,000 in receivables and $38,000 in weekly payroll. Which projects threaten payroll over the next 14 days?';
   await page.locator('#tfVoiceText').fill(typed);
   await page.locator('#tfVoiceForm button[type="submit"]').click();
   await page.waitForFunction(async()=>{
    const db=await new Promise(resolve=>{const q=indexedDB.open('tradeflow-lite-v1');q.onsuccess=()=>resolve(q.result)});
    const tx=db.transaction('aiConversationTurns','readonly');
    const rows=await new Promise(resolve=>{const q=tx.objectStore('aiConversationTurns').getAll();q.onsuccess=()=>resolve(q.result)});db.close();
    return rows.length>=2;
   });
   await page.screenshot({path:path.join(out,'typed-'+width+'.png'),animations:'disabled'});
   await page.locator('[data-voice="close"]').click();
   await orb.click();await page.locator('#tfOrbBubble').waitFor();
   await page.evaluate(()=>{
    window.__tf64Recognition.onresult({results:[{0:{transcript:'Cash is $10,000 or $1,000, and weekly payroll is $3,000. What threatens payroll in 14 days?'}}]});
   });
   await page.locator('[data-voice="mic"]').click();
   assert.equal(await page.evaluate(()=>window.TradeFlowVoice.state().draftModality),'voice');
   await page.locator('#tfVoiceForm button[type="submit"]').click();
   await page.waitForFunction(async()=>{
    const db=await new Promise(resolve=>{const q=indexedDB.open('tradeflow-lite-v1');q.onsuccess=()=>resolve(q.result)});
    const tx=db.transaction('aiConversationTurns','readonly');
    const rows=await new Promise(resolve=>{const q=tx.objectStore('aiConversationTurns').getAll();q.onsuccess=()=>resolve(q.result)});db.close();
    return rows.length>=4;
   });
   await page.screenshot({path:path.join(out,'voice-'+width+'.png'),animations:'disabled'});
   await page.reload();
   const {turns,threads}=await readTurns(page);
   assert.equal(threads.filter(x=>!x.deletedAt).length,1,'both modalities must share one thread');
   assert.equal(turns.length,4,'two user turns and two read-only scenario responses');
   assert.deepEqual(turns.filter(x=>x.role==='user').map(x=>x.modality).sort(),['text','voice']);
   assert.ok(turns.every(x=>x.threadId===threads[0].id));
   assert.ok(turns.filter(x=>x.role==='assistant').every(x=>x.source==='user_scenario'));
   assert.ok(turns.some(x=>x.role==='assistant'&&/cash|clarif|conflict|ambig/i.test(x.content)));
   assert.ok(!turns.some(x=>x.source==='verified_account'||x.source==='synthetic_mock'));
   assert.ok(turns.every(x=>x.syncState===undefined),'conversation turns must not masquerade as synced tenant records');
   // A real-company job/payroll request without bound financial data must be
   // answered in this SAME thread as missing evidence, not model job rankings.
   await page.waitForFunction(()=>!!window.TradeFlowVoice?.state);
   await page.locator('.tf-ai-orb').click();
   await page.locator('#tfOrbBubble').waitFor();
   await page.locator('#tfVoiceText').fill('Which jobs threaten payroll in the next two weeks and what should I do first?');
   await page.locator('#tfVoiceForm button[type="submit"]').click();
   await page.waitForFunction(async()=>{
    const db=await new Promise(resolve=>{const q=indexedDB.open('tradeflow-lite-v1');q.onsuccess=()=>resolve(q.result)});
    const tx=db.transaction('aiConversationTurns','readonly');
    const rows=await new Promise(resolve=>{const q=tx.objectStore('aiConversationTurns').getAll();q.onsuccess=()=>resolve(q.result)});db.close();
    return rows.length>=6;
   });
   await page.screenshot({path:path.join(out,'missing-financial-evidence-'+width+'.png'),animations:'disabled'});
   await page.reload();
   const revised=await readTurns(page);
   assert.equal(revised.threads.filter(x=>!x.deletedAt).length,1);
   assert.equal(revised.turns.length,6);
   assert.ok(revised.turns.every(x=>x.threadId===revised.threads[0].id));
   const last=revised.turns.filter(x=>x.role==='assistant').at(-1);
   assert.equal(last.source,'financial_missing_data','unbound company request cannot claim verified financial records');
   assert.match(last.content,/FINANCIAL EVIDENCE MISSING/);
   assert.match(last.content,/No tenant financial data was read/);
   assert.ok(!revised.turns.some(x=>x.source==='verified_tenant_record'||x.source==='synthetic_mock'));
   console.log('X01 '+width+'px: same scoped IndexedDB thread, 6 turns, financial missing-data gate and reload PASS');
   await context.tracing.stop({path:path.join(out,'trace-'+width+'.zip')});
   await context.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
