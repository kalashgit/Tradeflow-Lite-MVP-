'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('public/revenue.js','utf8');
function boot(){
 const handlers={},window={},document={addEventListener:(event,fn)=>(handlers[event]??=[]).push(fn)};
 const alerts=[],confirmations=[];
 vm.runInNewContext(src,{window,document,Date,Math,Number,Intl,confirm:msg=>{confirmations.push(msg);return true},
 alert:msg=>alerts.push(msg),console}, {timeout:3000});
 const invoices=[{id:'i1',reference:'INV-44',customerId:'c1',jobId:'j1',status:'Issued',issuedDate:'2026-10-01',dueDate:'2026-10-20',
 taxRate:0,lines:[{description:'Service',qty:1,unitPrice:200}]}],tasks=[],payments=[];
 const all={invoices,tasks,payments,customers:[{id:'c1',name:'Client'}],jobs:[{id:'j1',customerId:'c1',title:'Service job'}],quotes:[]};
 let writes=0;
 window.TradeFlowRevenue.configure({get:async(s,id)=>(all[s]||[]).find(x=>x.id===id),all:async s=>all[s]||[],put:async(s,x)=>{all[s].push(x);writes++},uid:()=>`task-${++writes}`,
 render:async()=>{},notify:()=>{},navigate:async()=>{}});
 window.TradeFlowRevenue.focusRecord('i1');
 return {window,handlers,all,alerts,confirmations,get writes(){return writes},click:async(action='followup')=>
 handlers.click[0]({target:{closest:()=>({dataset:{revenueAction:action,id:'i1'}})},preventDefault(){}})};
}
test('payment follow-up creates one local task but sends nothing',async()=>{
 const b=boot(),page=b.window.TradeFlowRevenue.render('invoices',b.all);
 assert.match(page,/Schedule payment follow-up/);
 await b.click();
 assert.equal(b.all.tasks.length,1);
 const t=b.all.tasks[0];assert.equal(t.invoiceId,'i1');assert.equal(t.customerId,'c1');assert.equal(t.status,'Open');
 assert.match(t.description,/No outbound message was sent/);
 assert.equal(b.confirmations.length,1);assert.equal(b.alerts.length,0);
 const after=b.window.TradeFlowRevenue.render('invoices',b.all);
 assert.ok(!after.includes('Schedule payment follow-up'));
 await b.click();assert.equal(b.all.tasks.length,1);
});
test('paid invoice has no collection follow-up action',()=>{
 const b=boot();b.all.payments.push({id:'p',invoiceId:'i1',amount:200});
 const page=b.window.TradeFlowRevenue.render('invoices',b.all);
 assert.ok(!page.includes('Schedule payment follow-up'));
});
