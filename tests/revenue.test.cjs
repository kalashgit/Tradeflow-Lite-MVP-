'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('public/revenue.js','utf8'),app=fs.readFileSync('public/app.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
const handlers={},win={},doc={addEventListener(n,cb){(handlers[n]||(handlers[n]=[])).push(cb)}};
class FD{constructor(form){this.fields=form.fields||{}} get(n){return this.fields[n]??''}}
vm.runInNewContext(src,{window:win,document:doc,FormData:FD,Date,Math,Set,console,Intl,alert:()=>{throw Error('unexpected alert')},confirm:()=>true},{timeout:4000});
const mod=win.TradeFlowRevenue;
assert.ok(mod?.configure&&mod?.render,'Revenue module exported');
const total=mod._test.totals({taxRate:8.25,lines:[{qty:2,unitPrice:125.50},{qty:1,unitPrice:39.99}]});
assert.equal(total.subtotal,290.99);assert.equal(total.tax,24.01);assert.equal(total.total,315);
assert.equal(mod._test.state({id:'i1',status:'Issued',taxRate:0,lines:[{qty:1,unitPrice:100}]},[{id:'p',invoiceId:'i1',amount:30}]),'Part-paid');
assert.equal(mod._test.state({id:'i1',status:'Issued',taxRate:0,lines:[{qty:1,unitPrice:100}]},[{id:'p',invoiceId:'i1',amount:100}]),'Paid');
assert.ok(!mod._test.esc('<img src=x>').includes('<img'));
const store={customers:[{id:'c1',name:'Customer 1',email:'owner@example.com'}],jobs:[{id:'j1',title:'Installation',customerId:'c1'}],quotes:[],invoices:[],payments:[],expenses:[],jobCosts:[]};
let next=1;
mod.configure({get:async(s,id)=>store[s]?.find(x=>x.id===id),all:async s=>store[s]||[],
 put:async(s,x)=>{let list=store[s];if(!list)throw Error('missing store '+s);let idx=list.findIndex(y=>y.id===x.id);if(idx<0)list.push(x);else list[idx]=x},
 del:async(s,id)=>{store[s]=store[s].filter(x=>x.id!==id)},uid:()=>String(next++),notify(){},render(){}});
assert.ok(mod.render('invoices',store).includes('Create new invoice'));
assert.ok(mod.render('invoices',store).includes('Outstanding'));
assert.ok(mod.render('invoices',store).includes('Paid this month'));
assert.ok(mod.render('invoices',store).includes('Draft invoices'));
assert.ok(mod.render('invoices',store).includes('data-filter="Overdue"'));
assert.ok(mod.render('invoices',store).includes('tf-inv-metrics'));

assert.ok(mod.render('profitability',store).includes('Select a job'));
const click=handlers.click[0],submit=handlers.submit[0];
const c=(action,id)=>({preventDefault(){},target:{closest:()=>({dataset:{revenueAction:action,id}})}});
const f=(id,fields,extra={})=>({preventDefault(){},target:{id,fields,dataset:extra,querySelectorAll(name){
 if(name==='[name=lineDescription]')return [{value:'Breaker replacement'}];
 if(name==='[name=lineQty]')return [{value:'2'}];
 if(name==='[name=linePrice]')return [{value:'125'}];
 return [];
}}});
(async()=>{
 await click(c('new'));
 await submit(f('tfRevenueInvoiceForm',{reference:'TF-001',customerId:'c1',jobId:'j1',quoteId:'',issuedDate:'2026-10-16',dueDate:'2026-10-22',taxRate:'0',notes:''}));
 assert.equal(store.invoices.length,1);
 assert.equal(store.invoices[0].status,'Draft');
 assert.equal(mod._test.totals(store.invoices[0]).total,250);
 await click(c('issue',store.invoices[0].id));assert.equal(store.invoices[0].status,'Issued');
 await submit(f('tfRevenuePaymentForm',{amount:'100',date:'2026-10-16',method:'Cash'},{id:store.invoices[0].id}));
 assert.equal(store.payments.length,1);assert.equal(store.payments[0].manual,true);
 assert.equal(mod._test.state(store.invoices[0],store.payments),'Part-paid');
 await submit(f('tfRevenueCostForm',{title:'Labor',amount:'35.00',type:'actual',category:'Labor'},{id:'j1'}));
 assert.equal(store.jobCosts.length,1);
 await click(c('job','j1'));
 const profit=mod.render('profitability',store);assert.ok(profit.includes('Cash contribution')&&profit.includes('€65.00'));
 assert.ok(profit.includes('not an audited profit'));
 assert.ok(app.includes("'invoices','jobCosts'")&&app.includes('indexedDB.open(DB,9)'));
 assert.ok(app.includes('version:9,exportedAt')&&app.includes("data.version<6"));
 assert.ok(html.includes('./revenue.js')&&html.includes('./revenue.css')&&sw.includes('./revenue.js'));
 console.log('PASS: Revenue R03 invoice save, issue, manual payment, job costs, currency disclosure, backup compatibility');
})().catch(e=>{console.error(e);process.exitCode=1});
