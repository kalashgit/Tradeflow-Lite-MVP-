'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const iconsJs=fs.readFileSync('public/integration-logos.js','utf8');
const js=fs.readFileSync('public/integrations-v2.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const win={},listeners={},downloads=[],doc={
 addEventListener:(type,cb)=>{(listeners[type]||(listeners[type]=[])).push(cb)},
 querySelectorAll:()=>[],
 getElementById:()=>null,
 createElement:()=>({href:'',download:'',click(){downloads.push(this.download)},remove(){}}),
 body:{appendChild(){}}
};
const ctx={window:win,document:doc,Date,Math,Set,Map,console,Intl,Blob:class{constructor(parts,options){this.parts=parts;this.options=options}},
 URL:{createObjectURL:()=> 'blob:integration-test',revokeObjectURL(){}},setTimeout:(fn)=>fn(),
 alert:x=>{throw Error('unexpected alert: '+x)},confirm:()=>true};
vm.runInNewContext(iconsJs,ctx,{timeout:3000});
vm.runInNewContext(js,ctx,{timeout:3000});
const mod=win.TradeFlowIntegrations;
assert.ok(mod?.configure&&mod?.render,'Standalone Integration Hub loads');
assert.ok(win.TradeFlowBrandIcons.icon('stripe','Stripe').includes('<svg'));
assert.ok(win.TradeFlowBrandIcons.icon('quickbooks','QuickBooks').includes('<svg'));
assert.ok(win.TradeFlowBrandIcons.icon('googlecalendar','Google Calendar').includes('<svg'));
assert.ok(win.TradeFlowBrandIcons.icon('microsoft','Microsoft Outlook').includes('#F25022'));
assert.ok(win.TradeFlowBrandIcons.ids.length>=10,'Offline brand assets bundled');
const providers=mod._test.providers;
assert.ok(providers.length>=12,'Provider catalog is useful');
assert.equal(new Set(providers.map(x=>x.id)).size,providers.length,'No duplicate provider IDs');
assert.ok(providers.every(x=>x.website.startsWith('https://')),'Only HTTPS provider URLs');
const initial=mod.render({});
assert.ok(initial.includes('Connected accounts'));
assert.ok(initial.includes('Provider catalog'));
assert.ok(initial.includes('Google Calendar')&&initial.includes('QuickBooks Online')&&initial.includes('Stripe'));
assert.ok(initial.includes('Search integrations'));
assert.ok(initial.includes('Connect your business')||initial.includes('Explore integrations'));
assert.ok(initial.includes('No provider OAuth active'),'No fake connection claims');
assert.ok(initial.includes('Export Finance CSV')&&initial.includes('Export job calendar'));
assert.ok(initial.includes('data-tab="invoices"'),'Native Mail handoff via Invoices preserved');
assert.ok(!initial.includes('data-int-action="connect"'),'No inert or deceptive Connect buttons');
assert.equal(mod._test.validDate('2026-02-30'),false);
assert.equal(mod._test.validDate('2026-10-17'),true);
const csv=mod._test.financeCsv([{id:'p1',amount:150,date:'2026-10-17',title:'Payment'}],[{id:'e1',amount:25,date:'2026-10-17',title:'=HYPERLINK("evil")'}]);
assert.ok(csv.includes('received_payment')&&csv.includes('expense'));
assert.ok(csv.includes("'=HYPERLINK"),'Spreadsheet formula injection neutralized');
assert.ok(csv.includes('amount_eur'),'Existing finance exports disclose EUR');
const ics=mod._test.calendarIcs([
 {id:'j1',title:'Panel & testing',status:'Planned',date:'2026-10-17',startTime:'09:30',durationMinutes:120,address:'100 Main St, Austin, TX'},
 {id:'j2',title:'Incomplete',status:'Planned',date:'2026-10-17'},
 {id:'j3',title:'Cancelled',status:'Cancelled',date:'2026-10-17',startTime:'10:00',durationMinutes:60}
],'20261017T010000Z');
assert.equal(ics.count,1);
assert.ok(ics.content.includes('BEGIN:VEVENT')&&ics.content.includes('DTSTART:20261017T093000'));
assert.ok(ics.content.includes('DTEND:20261017T113000'));
assert.ok(ics.content.includes('LOCATION:100 Main St\\, Austin\\, TX'));
assert.ok(!ics.content.includes('Incomplete')&&!ics.content.includes('Cancelled'));
const stores={
 tasks:[],payments:[{id:'p1',amount:150,date:'2026-10-17',title:'Payment'}],
 expenses:[{id:'e1',amount:25,date:'2026-10-17',title:'Supplies'}],
 jobs:[{id:'j1',title:'Panel',date:'2026-10-17',startTime:'09:30',durationMinutes:120,status:'Planned'}]
};
let calls=0,notices=[],id=0;
mod.configure({all:async store=>stores[store]||[],get:async(store,recId)=>stores[store]?.find(x=>x.id===recId),
 put:async(store,record)=>{let idx=stores[store].findIndex(x=>x.id===record.id);if(idx<0)stores[store].push(record);else stores[store][idx]=record},
 uid:()=>String(++id),render(){calls++},notify(message){notices.push(message)}});
const click=listeners.click[0],evt=(action,fields={})=>({preventDefault(){},target:{closest:()=>({dataset:{intAction:action,...fields}})}});
(async()=>{
 await click(evt('detail',{id:'google-calendar'}));
 assert.ok(mod.render({}).includes('Google Calendar'));
 assert.ok(mod.render({}).includes('Connect unavailable'));
 assert.ok(mod.render({}).includes('Create setup task'));
 assert.ok(mod.render({}).includes('Official provider registration'));
 await click(evt('setup-task',{id:'google-calendar'}));
 assert.equal(stores.tasks.length,1,'Setup task is actually persisted');
 assert.equal(stores.tasks[0].integrationProviderId,'google-calendar');
 await click(evt('setup-task',{id:'google-calendar'}));
 assert.equal(stores.tasks.length,1,'Setup tasks are idempotent');
 await click(evt('back'));
 await click(evt('category',{category:'Finance'}));
 assert.ok(mod.render({}).includes('QuickBooks Online')&&mod.render({}).includes('Stripe'));
 assert.ok(!mod.render({}).includes('Google Calendar'),'Category filter truly narrows catalog');
 await click(evt('category',{category:'Connected'}));
 assert.ok(mod.render({}).includes('No connected accounts yet.'));
 await click(evt('category',{category:'All'}));
 await click(evt('finance-export'));
 await click(evt('calendar-export'));
 assert.ok(downloads.some(x=>x.endsWith('.csv'))&&downloads.some(x=>x.endsWith('.ics')),'Offline handoffs download actual files');
 assert.ok(notices.some(x=>x.includes('no accounting account was connected')));
 assert.ok(!js.includes('fetch('),'No fake background provider sync or hidden requests');
 assert.ok(app.includes("TradeFlowIntegrations?.render(d)")&&app.includes("TradeFlowIntegrations?.configure"));
 assert.ok(html.includes('integration-logos.js')&&html.includes('integrations-v2.js')&&html.includes('integrations-v2.css'));
 assert.ok(sw.includes('integration-logos.js')&&sw.includes('integrations-v2.js'));
 assert.ok(calls>1,'Filters and details render as interactive screens');
 console.log('PASS: Integration Hub V2 branded offline catalog, honest connection states, details, setup tasks, CSV and ICS exports');
})().catch(e=>{console.error(e);process.exitCode=1});
