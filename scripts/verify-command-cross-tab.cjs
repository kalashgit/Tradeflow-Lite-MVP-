'use strict';
// TF-H01 actual Chromium two-tab IndexedDB contention; synthetic data only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const root=path.resolve('public'),out='artifacts/command-cross-tab';
fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://local').pathname;
 const file=path.resolve(root,'.'+(route==='/'?'/index.html':route));
 if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return}
 fs.readFile(file,(error,buffer)=>{if(error){res.writeHead(404);res.end();return}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(buffer)})
});
async function state(page){
 return page.evaluate(async()=>{
  const request=indexedDB.open('tradeflow-lite-v1',9);
  const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  try{return await window.TradeFlowLocalRecovery.readStores(db,['quotes','commandLog'])}finally{db.close()}
 });
}
async function boot(page){await page.goto('http://127.0.0.1:4196');await page.waitForFunction(()=>!!window.TradeFlowPilot?.commands,{timeout:15000})}
async function run(viewport,browser){
 const context=await browser.newContext({viewport,timezoneId:'America/Chicago'}),one=await context.newPage(),two=await context.newPage();
 const result={viewport,source:'synthetic real-browser cross-tab IndexedDB',contractorAccepted:false,status:'running'};
 try{
  await boot(one);await boot(two);
  await one.evaluate(async()=>{
   const q=indexedDB.open('tradeflow-lite-v1',9),db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   const t=db.transaction(['customers','quotes','settings'],'readwrite');
   t.objectStore('customers').put({id:'h01-customer',name:'Synthetic panel customer',businessId:'local-business'});
   t.objectStore('quotes').put({id:'h01-quote',title:'Synthetic quote for concurrent reuse',category:'Electrical',
    customerId:'h01-customer',status:'Accepted',amount:'1200.00',signature:'Never copy',businessId:'local-business'});
   t.objectStore('settings').put({id:'business',company:'Synthetic contractor',primaryTrade:'Electrical',onboardingComplete:true});
   await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=()=>reject(t.error)});db.close();
  });
  await Promise.all([one.reload(),two.reload()]);
  await Promise.all([one.waitForFunction(()=>!!window.TradeFlowPilot?.commands),two.waitForFunction(()=>!!window.TradeFlowPilot?.commands)]);
  const intent={commandId:'quotation.reuse.create',params:{ref:{store:'quotes',id:'h01-quote'}}};
  const requestKey='tf-h01-concurrent-'+viewport.width;
  const [preparedA,preparedB]=await Promise.all([
   one.evaluate(({intent,requestKey})=>window.TradeFlowPilot.commands.prepare(intent,{requestKey}),{intent,requestKey}),
   two.evaluate(({intent,requestKey})=>window.TradeFlowPilot.commands.prepare(intent,{requestKey}),{intent,requestKey})
  ]);
  assert.equal(preparedA.status,'needs_review');
  assert.equal(preparedA.id,preparedB.id);
  const id=preparedA.id;
  const approvals=await Promise.all([
   one.evaluate(id=>window.TradeFlowPilot.commands.approve(id),id),
   two.evaluate(id=>window.TradeFlowPilot.commands.approve(id),id)
  ]);
  assert.ok(approvals.every(x=>x.status==='approved'),JSON.stringify(approvals));
  const effects=await Promise.all([
   one.evaluate(id=>window.TradeFlowPilot.commands.execute(id),id),
   two.evaluate(id=>window.TradeFlowPilot.commands.execute(id),id)
  ]);
  assert.ok(effects.some(x=>x.status==='succeeded'),JSON.stringify(effects));
  assert.ok(effects.every(x=>['succeeded','in_progress'].includes(x.status)),JSON.stringify(effects));
  let data=await state(one),drafts=data.quotes.filter(q=>q.sourceQuoteId==='h01-quote');
  assert.equal(drafts.length,1,'Exactly one draft may be created across tabs');
  assert.equal(drafts[0].status,'Draft');assert.equal(drafts[0].customerId,'');
  assert.equal(drafts[0].signature,undefined);assert.equal(drafts[0].reuseEvidence.customerAuthorizationCopied,false);
  assert.equal(data.commandLog.filter(c=>c.kind==='quotation.reuse.create').length,1);
  assert.equal(data.commandLog.filter(c=>c.kind==='domain.event'&&c.type==='quotation.created').length,1);
  await two.reload();await two.waitForFunction(()=>!!window.TradeFlowPilot?.commands);
  const repeated=await two.evaluate(id=>window.TradeFlowPilot.commands.execute(id),id);
  assert.equal(repeated.status,'succeeded');
  data=await state(two);assert.equal(data.quotes.filter(q=>q.sourceQuoteId==='h01-quote').length,1);
  await one.screenshot({path:path.join(out,'two-tabs-'+viewport.width+'.png')});
  result.status='pass';result.singleDurableDraft=true;result.singleReceipt=true;result.reusedAfterReload=true;
  fs.writeFileSync(path.join(out,'result-'+viewport.width+'.json'),JSON.stringify(result,null,2));
  return result;
 }finally{await context.close()}
}
(async()=>{
 await new Promise(resolve=>server.listen(4196,'127.0.0.1',resolve));
 const browser=await chromium.launch({args:['--no-sandbox']}),results=[];
 try{
  for(const viewport of [{width:390,height:844},{width:1280,height:900}])results.push(await run(viewport,browser));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({sha:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results},null,2));
 console.log(results.length+'/'+results.length+' Chromium two-tab command concurrency scenarios passed; field acceptance unverified.');
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
