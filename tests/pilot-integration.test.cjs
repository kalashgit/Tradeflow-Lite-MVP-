'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {createDB}=require('./helpers/local-db.cjs');
const command=require('../public/command-registry.js'),intelligence=require('../public/operational-intelligence.js'),core=require('../public/core-integration.js');
const source=fs.readFileSync('public/app.js','utf8');const start=source.indexOf('(async()=>{try{db=await openDB();'),stop=source.indexOf('// V0.5: online MapLibre',start);assert.ok(start>0&&stop>start);
const app=source.slice(0,start)+source.slice(stop);
const html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
test('new modules load before the app, are cached offline, and schema and deployment guard stay unchanged',()=>{
 for(const asset of ['command-registry.js','operational-intelligence.js']){assert.ok(html.indexOf(asset)<html.indexOf('type="module" src="./app.js'));assert.ok(sw.includes(asset))}
 assert.ok(source.includes('indexedDB.open(DB,9)'));assert.ok(source.includes('version:9,exportedAt'));
 assert.ok(!source.includes('indexedDB.deleteDatabase'));
 const workflow=fs.readFileSync('.github/workflows/deploy-tradeflow-preview.yml','utf8');assert.ok(workflow.includes("config.name !== 'tradeflow-v05-preview'"));assert.ok(workflow.includes('--name tradeflow-v05-preview'));
});
test('real app adapters reuse navigation/forms and preserve backups, records and local scope',async()=>{
 let blob=null,renders=0;
 const document={addEventListener(){},querySelector(){return {innerHTML:'',scrollTo(){}}},querySelectorAll(){return []},documentElement:{style:{setProperty(){}}},createElement(){return {click(){},remove(){}}}};
 const window={addEventListener(){},TradeFlowCommands:command,TradeFlowIntelligence:intelligence,TradeFlowCore:core};
 const db=createDB({customers:[{id:'c1',name:'Customer',phone:'123',custom:'keep'}],quotes:[{id:'q1',title:'Accepted scope',status:'Accepted',customerId:'c1',category:'Electrical'}],settings:[{id:'business',company:'Pilot owner',primaryTrade:'Electrical'}]});
 const sandbox={window,document,console,navigator:{},crypto:webcrypto,Blob,URL:{createObjectURL(b){blob=b;return 'blob:backup'},revokeObjectURL(){}},setTimeout(){},clearTimeout(){},confirm:()=>true,assert,hostDB:db,renderProbe:()=>{renders++},alert:m=>{throw Error(m)},FormData:class{constructor(f){this.fields=f.fields}entries(){return Object.entries(this.fields)}[Symbol.iterator](){return this.entries()}}};
 const ctx=vm.createContext(sandbox);vm.runInContext(fs.readFileSync('public/calendar.js','utf8'),ctx);vm.runInContext(fs.readFileSync('public/revenue.js','utf8'),ctx);vm.runInContext(app,ctx);
 await vm.runInContext(`(async()=>{
 db=hostDB;prefs={company:'Pilot owner',primaryTrade:'Electrical'};render=async()=>renderProbe();notify=()=>{};tfInitializePilot();
 assert.ok(window.TradeFlowPilot?.commands&&window.TradeFlowPilot?.evaluate);
 const before=await tfPilotSnapshot();
 const nav=await window.TradeFlowPilot.commands.prepare('open tasks');assert.equal((await window.TradeFlowPilot.commands.execute(nav.id)).status,'succeeded');assert.equal(tab,'tasks');
 const open=await window.TradeFlowPilot.commands.prepare('open quote q1');const opened=await window.TradeFlowPilot.commands.execute(open.id);assert.equal(opened.status,'succeeded',JSON.stringify(opened));assert.equal(tab,'quotes');assert.equal(tfRecordDetailId,'q1');
 const draft=await window.TradeFlowPilot.commands.prepare('draft task');assert.equal((await window.TradeFlowPilot.commands.execute(draft.id)).status,'succeeded');assert.equal(modal.draftDefaults.quoteId,'q1');assert.equal(modal.draftDefaults.customerId,'c1');
 assert.ok(formModal(await tfPilotSnapshot()).includes('Review Accepted scope'));
 const view=await window.TradeFlowPilot.commands.prepare('show overdue tasks');assert.equal((await window.TradeFlowPilot.commands.execute(view.id)).status,'succeeded');assert.equal(tfPilotFilter.filter,'overdue');
 const report=await window.TradeFlowPilot.evaluate();assert.ok(report.findings.some(x=>x.detectorId==='quotation.accepted_handoff'));
 const after=await tfPilotSnapshot();for(const store of STORES.filter(s=>s!=='commandLog'))assert.equal(JSON.stringify(after[store]),JSON.stringify(before[store]));
 await exportData();
})()`,ctx);
 const backup=JSON.parse(await blob.text());assert.equal(backup.version,9);assert.ok(backup.stores.commandLog.some(x=>x.kind==='pilot.command'));assert.equal(backup.stores.customers[0].custom,'keep');assert.ok(renders>=4);
 sandbox.restoreFile={text:async()=>JSON.stringify(backup)};await vm.runInContext('restore(restoreFile)',ctx);assert.deepEqual(db.dump().customers,backup.stores.customers);assert.deepEqual(db.dump().quotes,backup.stores.quotes);assert.deepEqual(db.dump().commandLog,backup.stores.commandLog);assert.equal(db.version,9);
});