'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/marketing.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),
 app=fs.readFileSync('public/app.js','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
const listeners={},win={},doc={addEventListener(name,cb){(listeners[name]||(listeners[name]=[])).push(cb)}};
class FD{constructor(form){this.f=form.fields||{}}get(key){return this.f[key]??''}}
vm.runInNewContext(source,{window:win,document:doc,FormData:FD,Date,Math,console,Set,navigator:{clipboard:{writeText:async()=>{}}},alert:()=>{throw Error('unexpected alert')},confirm:()=>true},{timeout:5000});
const mod=win.TradeFlowMarketing;assert.ok(mod?.configure&&mod?.render);
const data={marketingCampaigns:[],customers:[{id:'c1',name:'Property Owner',email:'owner@example.com'}],jobs:[{id:'j1',customerId:'c1',title:'Upgrade',status:'Completed'}],quotes:[{id:'q1',customerId:'c1',status:'Accepted'}],payments:[{id:'p1',customerId:'c1',amount:360}],invoices:[],expenses:[],settings:[{id:'growth-profiles-v1',icps:[{id:'p1',name:'Local property owners'}],personas:[{id:'b1',name:'Facility manager'}],activeIcpId:'p1'}],tasks:[]};
assert.ok(mod.render('marketing',data).includes('Marketing Studio'));
assert.ok(mod.render('marketing',data).includes('Customer → Revenue'));
assert.ok(mod.render('marketing',data).includes('Channel performance'));
assert.ok(mod.render('marketing',data).includes('Source-tracked customers'));
assert.ok(mod.render('marketing',data).includes('data-marketing-action="source-new"'));
assert.equal(mod._test.marketingSummary(data).tracked,0);
assert.equal(mod._test.marketingSummary(data).cash,0);

assert.ok(mod.render('marketing',data).includes('nothing')||mod.render('marketing',data).includes('Nothing gets sent'));
assert.equal(mod._test.templates.length,5);
assert.ok(mod._test.templates.some(x=>x.key==='review-request'&&x.message.includes('honest review')));
assert.ok(!mod._test.esc('<img src=x>').includes('<img'));
let counter=1;
mod.configure({get:async(s,id)=>data[s]?.find(x=>x.id===id),all:async s=>data[s]||[],
 put:async(s,row)=>{let rows=data[s],i=rows.findIndex(x=>x.id===row.id);if(i<0)rows.push(row);else rows[i]=row},
 del:async(s,id)=>{data[s]=data[s].filter(x=>x.id!==id)},uid:()=>String(counter++),render(){},notify(){}});
const click=listeners.click[0],submit=listeners.submit[0];
const c=(action,additional={})=>({preventDefault(){},target:{closest:()=>({dataset:{marketingAction:action,...additional}})}});
const form=(fields)=>({preventDefault(){},target:{id:'tfMarketingForm',fields}});
(async()=>{
 await click(c('template',{key:'review-request'}));
 assert.equal(data.marketingCampaigns.length,1);
 assert.equal(data.marketingCampaigns[0].status,'Draft');
 const record=data.marketingCampaigns[0];
 await submit(form({title:'Follow up on completed job',channel:'Review request',icpId:'p1',personaId:'b1',
  plannedDate:'2026-10-18',plannedBudget:'0',subject:'Your experience',message:'Please share an honest review.',cta:'Share feedback',status:'Ready'}));
 assert.equal(data.marketingCampaigns.length,1);
 assert.equal(data.marketingCampaigns[0].status,'Ready');
 await click(c('task',{id:record.id}));
 assert.equal(data.tasks.length,1);
 assert.equal(data.tasks[0].marketingCampaignId,record.id);
 assert.ok(mod.render('marketing',data).includes('Follow up on completed job'));
 assert.ok(html.includes('marketing.js')&&html.includes('marketing.css')&&sw.includes('marketing.js'));
 const extraSubmit=listeners.submit[1];
 const form2=(id,fields)=>({preventDefault(){},target:{id,fields}});
 await click(c('list'));
 await click(c('source-new'));
 assert.ok(mod.render('marketing',data).includes('Record customer source'));
 await extraSubmit(form2('tfMarketingSourceForm',{customerId:'c1',channel:'Referrals',date:'2026-10-17',campaignId:record.id,note:'Customer told us directly'}));
 assert.equal(mod._test.sourceData(data).length,1);
 const analytics=mod._test.marketingSummary(data);
 assert.equal(analytics.tracked,1);
 assert.equal(analytics.quotedCustomers,1);
 assert.equal(analytics.bookedCustomers,1);
 assert.equal(analytics.linkedJobs,1);
 assert.equal(analytics.cash,360);
 assert.equal(analytics.channels.find(x=>x.name==='Referrals').customers,1);
 await click(c('spend-new'));
 assert.ok(mod.render('marketing',data).includes('Record marketing spend'));
 await extraSubmit(form2('tfMarketingSpendForm',{title:'Paid listing',channel:'Referrals',date:'2026-10-17',amount:'40.20',campaignId:record.id}));
 assert.equal(data.expenses.length,1);
 assert.equal(data.expenses[0].marketingSpend,true);
 assert.equal(data.expenses[0].category,'Marketing');
 assert.equal(mod._test.marketingSummary(data).spend,40.20);
 await click(c('source-edit',{id:'c1'}));
 assert.ok(mod.render('marketing',data).includes('Remove source attribution'));
 await click(c('source-remove',{id:'c1'}));
 assert.equal(mod._test.marketingSummary(data).tracked,0);
 assert.equal(mod._test.marketingSummary(data).spend,40.20);
 assert.ok(app.includes("tab==='marketing'"));
 assert.ok(app.includes("'marketingCampaigns','crew','routePlans'"),'Marketing must have a real database store');
 assert.ok(app.includes('indexedDB.open(DB,9)'),'Marketing requires a browser storage migration');
 console.log('PASS: Marketing V2 campaigns, ICP/persona, local attribution, linked jobs/cash, Finance spend, safe manual workflows');
})().catch(err=>{console.error(err);process.exitCode=1});
