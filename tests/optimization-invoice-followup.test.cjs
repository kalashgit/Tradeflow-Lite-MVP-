'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('public/revenue.js','utf8');
function boot(){
 const handlers={},window={},document={addEventListener:(event,fn)=>(handlers[event]??=[]).push(fn)};
 const alerts=[],reviewCalls=[],notifications=[];
 vm.runInNewContext(src,{window,document,Date,Math,Number,Intl,
  alert:msg=>alerts.push(msg),console},{timeout:3000});
 const invoices=[{id:'i1',reference:'INV-44',customerId:'c1',jobId:'j1',status:'Issued',
  issuedDate:'2026-10-01',dueDate:'2026-10-20',taxRate:0,
  lines:[{description:'Service',qty:1,unitPrice:200}]}],tasks=[],payments=[];
 const all={invoices,tasks,payments,customers:[{id:'c1',name:'Client'}],
  jobs:[{id:'j1',customerId:'c1',title:'Service job'}],quotes:[]};
 let writes=0;
 window.TradeFlowRevenue.configure({get:async(s,id)=>(all[s]||[]).find(x=>x.id===id),
  all:async s=>all[s]||[],put:async(s,x)=>{all[s].push(x);writes++},
  uid:()=>`task-${++writes}`,render:async()=>{},notify:x=>notifications.push(x),
  navigate:async()=>{},scheduleInvoiceFollowup:async(inv,due)=>{
   reviewCalls.push({invoiceId:inv.id,due});
   return {status:'succeeded',result:{id:'approved-task-id',reused:false}};
  }});
 window.TradeFlowRevenue.focusRecord('i1');
 return {window,handlers,all,alerts,reviewCalls,notifications,get writes(){return writes},
  click:async(action='followup')=>handlers.click[0]({
   target:{closest:()=>({dataset:{revenueAction:action,id:'i1'}})},preventDefault(){}})};
}
test('overdue invoice action routes to owner-reviewed command adapter, never writes a task directly',async()=>{
 const b=boot(),page=b.window.TradeFlowRevenue.render('invoices',b.all);
 assert.match(page,/Review overdue invoice follow-up/);
 await b.click();
 assert.equal(b.reviewCalls.length,1);
 assert.equal(b.reviewCalls[0].invoiceId,'i1');
 assert.match(b.reviewCalls[0].due,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(b.all.tasks.length,0,'Only approved transactional core may create a task');
 assert.equal(b.writes,0);
 assert.match(b.notifications.join(' '),/No message was sent/);
 assert.equal(b.alerts.length,0);
});
test('fully paid invoice exposes no overdue follow-up action',()=>{
 const b=boot();b.all.payments.push({id:'p',invoiceId:'i1',amount:200});
 const page=b.window.TradeFlowRevenue.render('invoices',b.all);
 assert.ok(!page.includes('Review overdue invoice follow-up'));
});
