'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const changeSrc=fs.readFileSync('public/change-orders.js','utf8'),formsSrc=fs.readFileSync('public/job-forms.js','utf8');
function boot(){
 const events={},window={prompt:()=>'',confirm:()=>false},document={addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
 class FormData{constructor(form){this.data=form.fields||{}}get(key){return this.data[key]??null}}
 const alerts=[];
 vm.runInNewContext(changeSrc,{window,document,FormData,alert:msg=>alerts.push(String(msg)),Date,Number,Object,Array,console}, {timeout:3000});
 vm.runInNewContext(formsSrc,{window,document,FormData,alert:msg=>alerts.push(String(msg)),Date,Number,Object,Array,console,confirm:()=>true}, {timeout:3000});
 let job={id:'j1',title:'Service upgrade'},writes=0;
 window.TradeFlowJobForms.configure({get:async(store,id)=>{assert.equal(store,'jobs');assert.equal(id,'j1');return job},
  put:async(store,row)=>{assert.equal(store,'jobs');job=row;writes++},render:async()=>{},uid:()=>('co-'+(writes+1))});
 return {window,events,alerts,get job(){return job},get writes(){return writes},
  submit:async fields=>events.submit[0]({target:{id:'tfChangeOrderForm',dataset:{job:'j1'},fields},preventDefault(){}}),
  approve:async id=>events.click[0]({target:{closest:()=>({dataset:{tfChangeAction:'approve',id,job:'j1'}})},preventDefault(){}})};
}
test('proposed change orders persist locally, without invoicing or assuming customer consent',async()=>{
 const b=boot();
 assert.match(b.window.TradeFlowJobForms.panel(b.job),/Assessment checklist/);
 assert.match(b.window.TradeFlowJobForms.panel(b.job),/Extra work &amp; change orders/);
 await b.submit({description:'Additional circuit <script>',amount:'125.50'});
 assert.equal(b.writes,1);assert.equal(b.job.changeOrders.length,1);
 assert.equal(b.job.changeOrders[0].status,'proposed');
 assert.equal(b.job.changeOrders[0].amount,125.5);
 assert.equal(b.job.changeOrders[0].approvalEvidence,undefined);
 assert.ok(!b.window.TradeFlowJobForms.panel(b.job).includes('<script>'));
 assert.match(b.window.TradeFlowJobForms.panel(b.job),/Proposed, not approved/);
 assert.equal(b.job.invoices,undefined);
});
test('approval is blocked without separate evidence and owner confirmation',async()=>{
 const b=boot();
 await b.submit({description:'Add switch',amount:'50.00'});
 const id=b.job.changeOrders[0].id;
 await b.approve(id);assert.equal(b.job.changeOrders[0].status,'proposed');
 b.window.prompt=()=> 'Approved by email 2026-10-28';
 await b.approve(id);assert.equal(b.job.changeOrders[0].status,'proposed');
 b.window.confirm=()=>true;
 await b.approve(id);
 assert.equal(b.job.changeOrders[0].status,'approved_recorded');
 assert.equal(b.job.changeOrders[0].approvalEvidence,'Approved by email 2026-10-28');
 await b.approve(id);assert.equal(b.writes,2,'approved order cannot be approved twice');
});
test('rejects invalid and unreasonably large amounts without writing',async()=>{
 const b=boot();
 for(const amount of ['','-1','0','1.234','1000000.01','Infinity']){
  await b.submit({description:'Extra work',amount});
 }
 assert.equal(b.writes,0);
 assert.equal(b.alerts.length,6);
});
test('existing app shell loads change control before job forms and caches it',()=>{
 const html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
 assert.ok(html.indexOf('change-orders.js')<html.indexOf('job-forms.js'));
 assert.ok(sw.includes('change-orders.js?v=scope-r01'));
 assert.ok(sw.includes('change-orders\\\\.js')||sw.includes('change-orders.js'));
});
