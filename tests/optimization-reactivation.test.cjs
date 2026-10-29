'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const intelligence=require('../public/operational-intelligence.js'),commands=require('../public/command-registry.js');
const notificationsSource=fs.readFileSync('public/notifications.js','utf8');
const appSource=fs.readFileSync('public/app.js','utf8');
const window={},handlers={},document={addEventListener(type,handler){(handlers[type]??=[]).push(handler)},querySelector:()=>({focus(){}})};
vm.runInNewContext(notificationsSource,{window,document,Date,Math,Number,Set,Object,console}, {timeout:3000});
const notice=window.TradeFlowNotifications;
const engine=intelligence.createEngine({commands,detectors:intelligence.optimizationDetectors});
const NOW={now:'2026-10-28T12:00:00Z',today:'2026-10-28'};
const fixture=()=>({customers:[{id:'c1',name:'Former client',phone:'5551234567'},{id:'c2',name:'Active client',phone:'5559876543'}],
 jobs:[{id:'j1',customerId:'c1',status:'Completed',date:'2026-04-10'},{id:'j2',customerId:'c2',status:'In Progress',date:'2026-04-10'}],
 quotes:[],invoices:[],payments:[],tasks:[],events:[],crew:[]});
test('reactivation review only considers dormant recorded customers, never sends',()=>{
 const d=fixture(),report=engine.evaluate(d,NOW);
 assert.equal(report.findings.filter(x=>x.detectorId==='customer.reactivation_review').length,1);
 const f=report.findings.find(x=>x.detectorId==='customer.reactivation_review');
 assert.equal(f.recordRefs[0].id,'c1');assert.equal(f.confidence,'limited');
 assert.ok(f.limitations.some(x=>/external systems/.test(x)));
 const items=notice._test.generate(d,Date.parse(NOW.now),report);
 assert.equal(items.find(x=>x.title==='Past customer relationship review').recordRef.id,'c1');
 d.events.push({id:'contact',kind:'customer_contact',customerId:'c1',date:'2026-10-20T12:00:00Z'});
 assert.equal(engine.evaluate(d,NOW).findings.filter(x=>x.detectorId==='customer.reactivation_review').length,0);
});
test('notifications can open actual source records with the existing app adapter',async()=>{
 let opened,nav='',writes=0;const d={...fixture(),settings:[]};
 notice.configure({get:async()=>null,put:async()=>{writes++},render:async()=>{},openRecord:async ref=>{opened=ref},navigate:async route=>{nav=route},
 intelligence:()=>({findings:[{id:'inv:1',detectorId:'invoice.overdue',recordRefs:[{store:'invoices',id:'i1'}],explanation:'Unpaid',priority:{tier:1}}]})});
 const id='priority:intelligence:inv:1';
 const button={dataset:{notifAction:'go',notifId:id}};
 notice.home(d,'bell');
 await handlers.click[0]({target:{closest:selector=>selector==='[data-notif-action]'?button:null},preventDefault(){},stopImmediatePropagation(){}});
 assert.deepEqual(JSON.parse(JSON.stringify(opened)),{store:'invoices',id:'i1'});
 assert.equal(nav,'');assert.ok(writes>=1);
 assert.ok(appSource.includes('openRecord:tfPilotOpenRecord'));
});
