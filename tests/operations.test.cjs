'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('public/operations.js','utf8'),app=fs.readFileSync('public/app.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
const win={},handlers={};
const document={addEventListener(name,cb){(handlers[name]||(handlers[name]=[])).push(cb)}};
class FormDataMock{constructor(form){this.fields=form.fields||{}}get(key){return this.fields[key]??''}}
vm.runInNewContext(js,{window:win,document,FormData:FormDataMock,Date,URL,Math,Set,console,Intl,
 alert:x=>{throw Error('unexpected alert: '+x)},confirm:()=>true},{timeout:4000});
const ops=win.TradeFlowOperations;assert.ok(ops?.configure&&ops?.render);
assert.equal(ops._test.validDate('2026-10-16'),true);
assert.equal(ops._test.validDate('not-a-date'),false);
assert.equal(ops._test.validDate('2026-02-30'),false);
const stores={
 crew:[],routePlans:[],settings:[],tasks:[],customers:[{id:'c1',name:'Client',address:'101 Main St, Austin, TX'}],
 jobs:[{id:'j1',title:'Panel work',status:'Completed',date:'2026-10-16',customerId:'c1'},
 {id:'j2',title:'Lighting',status:'Planned',date:'2026-10-16',address:'250 2nd St, Austin, TX',customerId:'c1'}],
 expenses:[{id:'e1',amount:75,date:'2026-10-16',vendor:'Supplier',relatedId:'j1'}],
 payments:[{id:'p1',amount:200,date:'2026-10-16',source:'Customer',customerId:'c1'}]
};
let inc=0,notified=0;
ops.configure({
 all:async s=>stores[s]||[],get:async(s,id)=>stores[s]?.find(x=>x.id===id),
 put:async(s,row)=>{const list=stores[s];if(!list)throw Error('Unknown store: '+s);const i=list.findIndex(x=>x.id===row.id);if(i<0)list.push(row);else list[i]=row},
 del:async(s,id)=>{stores[s]=stores[s].filter(x=>x.id!==id)},
 uid:()=>String(++inc),render(){},notify(){notified++},navigate:async()=>{}
});
assert.ok(ops.render('dispatch',stores).includes('Crew &amp; Dispatch'));
assert.ok(ops.render('integrations',stores).includes('Not connected'));
assert.ok(ops.render('integrations',stores).includes('QuickBooks Online'));
assert.ok(ops._test.accountingCsv(stores).includes('received_payment'));
assert.ok(!ops._test.accountingCsv(stores).includes('client@example.com'));
const submit=handlers.submit[0],click=handlers.click[0];
const mkForm=(id,fields,extra={})=>({preventDefault(){},target:{id,fields,dataset:extra}});
const mkClick=(action,more={})=>({preventDefault(){},target:{closest:()=>({dataset:{opsAction:action,...more}})}});
(async()=>{
 await submit(mkForm('tfOpsCrewForm',{name:'Sam',role:'Electrician',notes:''}));
 assert.equal(stores.crew.length,1);
 await submit(mkForm('tfOpsAssignForm',{crewId:stores.crew[0].id},{id:'j1'}));
 assert.equal(stores.jobs[0].crewId,stores.crew[0].id);
 await submit(mkForm('tfOpsPlanForm',{name:'Thursday sites',date:'2026-10-16',crewId:stores.crew[0].id}));
 assert.equal(stores.routePlans.length,1);
 const plan=stores.routePlans[0];
 await submit(mkForm('tfOpsStopForm',{jobId:'j1'},{id:plan.id}));
 await submit(mkForm('tfOpsStopForm',{jobId:'j2'},{id:plan.id}));
 assert.deepEqual(Array.from(stores.routePlans[0].jobIds),['j1','j2']);
 const url=ops._test.routeUrl(stores,plan);
 assert.ok(url.startsWith('https://www.google.com/maps/dir/'));
 assert.ok(new URL(url).searchParams.get('origin').includes('101 Main St'));
 assert.ok(!url.includes('apiKey')&&!url.includes('optimized'));
 await click(mkClick('stop-up',{id:'j2'}));
 assert.deepEqual(Array.from(stores.routePlans[0].jobIds),['j2','j1']);
 await click(mkClick('review-tasks'));
 assert.equal(stores.tasks.length,1);
 assert.equal(stores.tasks[0].reviewJobId,'j1');
 await click(mkClick('review-tasks'));
 assert.equal(stores.tasks.length,1,'Review preparation tasks must be idempotent');
 assert.ok(app.includes("'crew','routePlans'")&&app.includes('indexedDB.open(DB,9)'));
 assert.ok(app.includes('version:9,exportedAt')&&app.includes("data.version<7"));
 assert.ok(html.includes('./operations.js')&&html.includes('./operations.css')&&sw.includes('./operations.js'));
 assert.ok(!js.includes("fetch("),'No hidden server or tracking calls');
 console.log('PASS: Operations R05 crew assignment, manual route ordering, safe direction link, review tasks, CSV and backup migration');
})().catch(e=>{console.error(e);process.exitCode=1});
