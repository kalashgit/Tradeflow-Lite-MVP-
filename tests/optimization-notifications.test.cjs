'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/notifications.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
function boot(){
 const listeners={},window={},document={addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn)},querySelector:()=>({focus(){}})};
 class FakeFormData{constructor(form){this.values=form.values}get(k){return this.values[k]||''}}
 vm.runInNewContext(source,{window,document,Date,Math,Number,Set,Object,FormData:FakeFormData,console,alert:msg=>{throw Error(msg)}},{timeout:3000});
 return {module:window.TradeFlowNotifications,listeners};
}
const NOW=new Date('2026-10-28T11:00:00Z').getTime();
const reports={findings:[
 {id:'invoice.overdue:invoices%3Ai1',detectorId:'invoice.overdue',recordRefs:[{store:'invoices',id:'i1'}],explanation:'Issued invoice remains unpaid.',status:'ready_for_review',priority:{tier:1}},
 {id:'calendar.conflict:jobs%3Aj1',detectorId:'calendar.conflict',recordRefs:[{store:'jobs',id:'j1'}],explanation:'Two bookings overlap.',status:'ready_for_review',priority:{tier:0}},
 {id:'quotation.stale_open:quotes%3Aq1',detectorId:'quotation.stale_open',recordRefs:[{store:'quotes',id:'q1'}],explanation:'Quote requires a follow-up.',status:'ready_for_review',priority:{tier:2}},
 {id:'quotation.accepted_handoff:quotes%3Aq2',detectorId:'quotation.accepted_handoff',recordRefs:[{store:'quotes',id:'q2'}],explanation:'Accepted quote not linked to a job.',status:'ready_for_review',priority:{tier:2}}
]};
function initial(){return {settings:[],tasks:[],quotes:[],jobs:[],invoices:[],opportunities:[],events:[]}}
test('existing Notifications surfaces four operational intelligence cases without a second page',()=>{
 const {module:m}=boot(),entries=m._test.generate(initial(),NOW,reports);
 for(const title of ['Overdue invoice','Scheduling conflict','Quotation follow-up review','Accepted quote needs job'])assert.ok(entries.some(x=>x.title===title),title);
 assert.equal(entries.filter(x=>x.id.startsWith('priority:intelligence')).length,4);
 assert.ok(entries.find(x=>x.title==='Overdue invoice').route==='invoices');
 assert.equal(new Set(entries.map(x=>x.id)).size,entries.length);
});
test('business obligations are due-date-validated, shown within 14 days and disappear when complete',()=>{
 const {module:m}=boot(),data=initial();
 data.tasks=[
  {id:'a',title:'Renew policy',due:'2026-11-10',status:'Open',taskType:'business_obligation',obligationType:'insurance'},
  {id:'b',title:'Too far out',due:'2026-11-15',status:'Open',taskType:'business_obligation',obligationType:'license'},
  {id:'c',title:'Completed',due:'2026-10-27',status:'Done',taskType:'business_obligation',obligationType:'license'},
  {id:'d',title:'Invalid',due:'2026-02-30',status:'Open',taskType:'business_obligation',obligationType:'license'}
 ];
 let list=m._test.generate(data,NOW);
 assert.ok(list.some(x=>x.id==='priority:task:a|2026-11-10'));
 assert.ok(!list.some(x=>x.id.includes('task:b')||x.id.includes('task:c')||x.id.includes('task:d')));
 data.tasks[0].status='Done';list=m._test.generate(data,NOW);
 assert.ok(!list.some(x=>x.id.includes('task:a')));
});
test('existing quote task suppresses redundant quote follow-up notification',()=>{
 const {module:m}=boot(),data=initial();
 data.tasks=[{id:'t',title:'Follow up quote',quoteId:'q1',due:'2026-10-28',status:'Open'}];
 data.quotes=[{id:'q1',title:'Panel upgrade',status:'Sent',followup_date:'2026-10-28'}];
 const items=m._test.generate(data,NOW,reports);
 assert.equal(items.filter(x=>x.id.includes('priority:task:t')).length,1);
 assert.equal(items.filter(x=>x.id.includes('priority:quote:q1')).length,0);
 assert.equal(items.filter(x=>x.title==='Quotation follow-up review').length,0);
});
test('user-entered obligation is saved as an ordinary linked task with no invented deadline',async()=>{
 const {module:m,listeners}=boot(),d=initial();let saved=null;
 m.configure({get:async()=>null,put:async(store,row)=>{if(store==='tasks'){saved=row;d.tasks.push(row)}},uid:()=>'verified-deadline-id',render:async()=>m.home(d,'bell'),navigate:async()=>{}});
 await m.show();
 const toggle={dataset:{notifAction:'obligation-new'}};
 await listeners.click[0]({target:{closest:selector=>selector==='[data-notif-action]'?toggle:null},preventDefault(){},stopImmediatePropagation(){}});
 assert.ok(m.home(d,'bell').includes('tfNotifObligationForm'));
 const form={id:'tfNotifObligationForm',values:{kind:'insurance',title:'Renew business policy',due:'2026-11-01',owner:'Office manager',notes:'Verified from insurer certificate'}};
 await listeners.submit[0]({target:form,preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(saved.id,'verified-deadline-id');
 assert.equal(saved.taskType,'business_obligation');
 assert.equal(saved.obligationType,'insurance');
 assert.equal(saved.due,'2026-11-01');
 assert.equal(saved.status,'Open');
 assert.ok(!m.home(d,'bell').includes('tfNotifObligationForm'));
});
test('business risk voice intent and cache versions are linked',()=>{
 const commands=require('../public/launch-more-commands.js');
 assert.equal(commands.parse('what needs attention').action,'businessRisks');
 assert.equal(commands.parse('show business bottlenecks').action,'businessRisks');
 assert.equal(commands.parse('show overdue tasks').action,'filter');
 assert.deepEqual(JSON.parse(JSON.stringify(commands.parse('show overdue invoices'))),{action:'filter',workspace:'invoices',filter:'overdue'});
 assert.deepEqual(JSON.parse(JSON.stringify(commands.parse('show unpaid invoices'))),{action:'filter',workspace:'invoices',filter:'unpaid'});
 assert.ok(html.includes('notifications.js?v=optimization-r04'));
 assert.ok(html.includes('launch-more-commands.js?v=optimization-r05'));
 assert.ok(sw.includes('notifications.js?v=optimization-r04'));
});
