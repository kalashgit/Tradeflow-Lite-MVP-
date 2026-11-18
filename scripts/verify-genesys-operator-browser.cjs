'use strict';
// Genesys operational loop in the REAL TradeFlow app: Chromium, the app's own IndexedDB,
// its own command runtime and executor, the preview host's /api/ai/genesys/interpret route,
// and the app's real approval dialog. The language model is replaced here by a scripted
// Ollama-compatible double (NOT AI) so the browser check is deterministic; real-model
// results come from scripts/run-genesys-operational-benchmark.cjs --mode=qwen.
// Outcomes are judged by reading IndexedDB through a separate connection.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createPreviewServer}=require('./local-ai-preview-server.cjs');
const bench=require('./run-genesys-operational-benchmark.cjs');
const {tradeflowStores}=require('../src/genesys-tradeflow-fixture.cjs');

const out=path.resolve('artifacts/genesys-operator-browser');fs.mkdirSync(out,{recursive:true});
const spec=JSON.parse(fs.readFileSync(bench.CASES,'utf8'));
const byInstruction=new Map(spec.cases.map(c=>[c.instruction,c]));
const STORES=['customers','quotes','jobs','invoices','payments','tasks','events','commandLog'];
const SETTINGS={id:'business',company:'Mock Genesys Electric (synthetic)',primaryTrade:'Electrical',onboardingComplete:true};
const secret=crypto.randomBytes(18).toString('base64url');
let modelCalls=0;
async function scriptedOllama(url,options={}){
 const route=new URL(url).pathname;
 const json=body=>({ok:true,status:200,json:async()=>body});
 if(route==='/api/version')return json({version:'scripted-double'});
 if(route==='/api/tags')return json({models:[{name:'qwen3:0.6b',digest:'scripted-double-not-a-model',details:{family:'none'}}]});
 if(route==='/api/chat'){
  modelCalls++;
  const user=JSON.parse(options.body).messages[1].content;
  const instruction=user.slice(user.lastIndexOf('Instruction: ')+13);
  const testCase=byInstruction.get(instruction);
  return json({done:true,done_reason:'stop',message:{content:JSON.stringify(testCase?testCase.oracleIntent:{steps:[],question:'?',unsupported:''})},prompt_eval_count:0,eval_count:0});
 }
 throw Error('unexpected model route '+route);
}
async function readStores(page){
 return page.evaluate(async names=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tradeflow-lite-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  try{const t=db.transaction(names,'readonly'),data={};
   await Promise.all(names.map(n=>new Promise((resolve,reject)=>{const q=t.objectStore(n).getAll();q.onsuccess=()=>{data[n]=q.result;resolve()};q.onerror=()=>reject(q.error)})));
   return data}finally{db.close()}
 },STORES);
}
async function seed(page,stores){
 await page.evaluate(async({names,stores,settings})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tradeflow-lite-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  try{await new Promise((resolve,reject)=>{const t=db.transaction([...names,'settings'],'readwrite');
   for(const n of names){const s=t.objectStore(n);s.clear();for(const r of stores[n]||[])s.put(r)}
   t.objectStore('settings').put(settings);
   t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}finally{db.close()}
 },{names:STORES,stores,settings:SETTINGS});
}
async function main(){
 const {server}=createPreviewServer({secret,mode:'live',genesysFetch:scriptedOllama});
 await new Promise(resolve=>server.listen(4197,'127.0.0.1',resolve));
 const browser=await chromium.launch();
 const results=[];
 try{
  const context=await browser.newContext({viewport:{width:430,height:932},timezoneId:'America/Chicago'});
  await context.addInitScript(code=>{try{sessionStorage.setItem('tf-ai-preview-code',code)}catch{}},secret);
  const page=await context.newPage();
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00-06:00'));
  const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));
  const dialogs=[];let decline=false;
  page.on('dialog',async d=>{dialogs.push(d.message());if(decline)await d.dismiss();else await d.accept()});
  await page.goto('http://127.0.0.1:4197/');
  await page.waitForFunction(()=>!!window.TradeFlowPilot?.genesys,{timeout:20000});
  const plan=[
   ['direct-invoice'],['multi-voicemail-followup'],['conflict-not-overdue'],['unsupported-mark-paid'],
   ['repeat-same'],['ambiguous-them'],['direct-invoice','declined']
  ];
  for(const [id,variant] of plan){
   const testCase=spec.cases.find(c=>c.id===id);
   await seed(page,tradeflowStores());
   const before=await readStores(page);
   decline=variant==='declined';const shown=dialogs.length;
   const episodes=[];
   for(let i=0;i<testCase.repeat;i++)
    episodes.push(await page.evaluate(([text,key])=>window.TradeFlowPilot.genesys.handle(text,{requestKey:key}),[testCase.instruction,'browser.'+id+'.'+(variant||'')+i]));
   const after=await readStores(page);
   const expected=variant==='declined'?{...testCase,accept:['not_approved'],expected_effects:[]}:testCase;
   const verdict=bench.judge(expected,before,after,episodes.map(bench.classify));
   results.push({id:id+(variant?'/'+variant:''),pass:verdict.pass,status:episodes.map(e=>e.status),
    approvalDialogs:dialogs.slice(shown),missingEffects:verdict.missingEffects,unexpectedChanges:verdict.unexpectedChanges,
    traceInIndexedDB:after.commandLog.some(r=>r.kind==='genesys.trace'&&r.id===episodes.at(-1).traceId),
    modelRecorded:episodes.at(-1).model||null});
  }
  // A visible record of the outcome: the app's own Tasks view after a verified run.
  decline=false;
  await seed(page,tradeflowStores());
  const shot=await page.evaluate(t=>window.TradeFlowPilot.genesys.handle(t,{requestKey:'browser.screenshot'}),spec.cases.find(c=>c.id==='multi-voicemail-followup').instruction);
  const shotTasks=(await readStores(page)).tasks;
  assert.equal(shot.status,'completed_verified');assert.equal(shotTasks.length,1);
  await page.reload();await page.waitForFunction(()=>!!window.TradeFlowPilot?.genesys,{timeout:20000});
  await page.evaluate(()=>window.TradeFlowPilot.commands.prepare({commandId:'workspace.open',params:{workspace:'tasks'}}).then(p=>window.TradeFlowPilot.commands.execute(p.id)));
  await page.waitForTimeout(600);
  await page.screenshot({path:path.join(out,'tasks-after-genesys.png'),fullPage:false});
  // The same loop through the app's own conversation box: More → TradeFlow AI → "Let Genesys act".
  decline=false;await seed(page,tradeflowStores());await page.reload();
  await page.waitForFunction(()=>!!window.TradeFlowPilot?.genesys,{timeout:20000});
  await page.locator('[data-tab="settings"]:visible').first().click();
  await page.locator('.tf-more-menu [data-tab="ai"]').click();
  await page.locator('[data-action="tfAiOptionsToggle"]').first().click();
  await page.locator('[data-action="tfAiSnapshotToggle"]').click();
  await page.locator('[data-action="tfAiTestConnection"]').click();
  await page.locator('[data-action="tfAiOperatorToggle"]').click();
  const chatCase=spec.cases.find(c=>c.id==='multi-email-quote');
  const chatBefore=await readStores(page),chatDialogs=dialogs.length;
  await page.locator('#tfAiChatForm textarea[name="prompt"]').fill(chatCase.instruction);
  await page.locator('#tfAiChatForm button[type="submit"]').click();
  await page.waitForFunction(()=>/Done and checked/.test(document.querySelector('.tf-ai-chat-thread')?.innerText||''),null,{timeout:30000});
  const chatAfter=await readStores(page);
  const chatVerdict=bench.judge(chatCase,chatBefore,chatAfter,['execute']);
  const chatText=await page.locator('.tf-ai-chat-thread').innerText();
  assert.match(chatText,/AION GENESYS · DONE · CHECKED IN YOUR RECORDS/,'the chat badge shows the verified outcome');
  assert.doesNotMatch(chatText,/MODEL UNAVAILABLE/);
  assert.match(await page.locator('.tf-ai-privacy').innerText(),/only after you approve/);
  await page.screenshot({path:path.join(out,'chat-genesys-reply.png'),fullPage:false});
  results.push({id:'chat-ui/'+chatCase.id,pass:chatVerdict.pass&&chatDialogs<dialogs.length,status:['completed_verified'],
   approvalDialogs:dialogs.slice(chatDialogs),missingEffects:chatVerdict.missingEffects,unexpectedChanges:chatVerdict.unexpectedChanges,
   traceInIndexedDB:chatAfter.commandLog.some(r=>r.kind==='genesys.trace'),modelRecorded:null,chatReply:chatText.slice(-400)});
  const report={source:'real Chromium + real TradeFlow IndexedDB/runtime/executor; scripted model double (NOT AI)',
   asOf:'2026-11-12',modelCalls,pageErrors:errors,results,passed:results.filter(r=>r.pass).length,total:results.length};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,1));
  console.log(JSON.stringify({passed:report.passed,total:report.total,pageErrors:errors.length,
   results:results.map(r=>r.id+': '+(r.pass?'PASS':'FAIL')+' '+r.status.join('>')+(r.traceInIndexedDB?' trace':' NO-TRACE'))},null,1));
  assert.equal(report.passed,report.total,'every browser case must match the expected persisted state');
  assert.ok(results.every(r=>r.traceInIndexedDB),'every episode leaves a Genesys trace in the app audit store');
 }finally{await browser.close();server.close()}
}
main().catch(error=>{console.error(error);process.exit(1)});
