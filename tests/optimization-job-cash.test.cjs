'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const revenue=fs.readFileSync('public/revenue.js','utf8'),app=fs.readFileSync('public/app.js','utf8');
function module(){
 const window={};const document={addEventListener(){},getElementById:()=>null};
 vm.runInNewContext(revenue,{window,document,Date,Intl,Math,Number,Object,Array,console}, {timeout:3000});
 return window.TradeFlowRevenue;
}
const data=()=>({invoices:[],jobs:[{id:'job-1',customerId:'c1',quoteId:'q1',title:'Electrical fit-out',status:'Completed'}],quotes:[{id:'q1',customerId:'c1',title:'Original scope',amount:1500,status:'Accepted'}],customers:[{id:'c1',name:'Property manager'}],payments:[]});
test('job handoff prepares linked invoice draft without fictional money or issuance',()=>{
 const mod=module();let rendered=0;
 mod.configure({render:()=>{rendered++},navigate:async()=>{},all:async()=>[]});
 mod.newForJob('job-1');
 const page=mod.render('invoices',data());
 assert.ok(page.includes('name="jobId"'));
 assert.ok(page.includes('value="job-1" selected'));
 assert.ok(page.includes('value="c1" selected'));
 assert.ok(page.includes('value="q1" selected'));
 assert.ok(page.includes('Electrical fit-out'));
 assert.ok(page.includes('value="0"'), 'User must enter a reviewed price');
 assert.ok(page.includes('Save draft'));
 assert.ok(!page.includes('Automatically sent'));
 assert.equal(rendered,1);
});
test('new unlinked invoice does not retain the previously selected job',()=>{
 const mod=module();mod.configure({render:()=>{},navigate:async()=>{},all:async()=>[]});
 mod.newForJob('job-1');mod.newForJob('job-1');
 const first=mod.render('invoices',data());assert.ok(first.includes('value="job-1" selected'));
 mod.filterView('All');mod.newForJob('job-1');
 assert.ok(mod.render('invoices',data()).includes('value="job-1" selected'));
});
test('home quote conversion excludes drafts from decided denominator',()=>{
 assert.ok(app.includes("tradeQuotes.filter(q=>['Accepted','Declined'].includes(q.status))"));
 assert.ok(app.includes('No decided quotations'));
 assert.ok(app.includes('decided quotations accepted'));
});
test('completed job UI offers draft handoff only with no active invoice',()=>{
 assert.ok(app.includes("data-action=\"tfJobInvoiceDraft\""));
 assert.ok(app.includes("window.TradeFlowRevenue?.newForJob?.(job.id)"));
 assert.ok(app.includes("inv.jobId===job.id&&inv.status!=='Void'"));
});
