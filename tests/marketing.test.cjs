'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/marketing.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),
 app=fs.readFileSync('public/app.js','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
const listeners={},win={},doc={addEventListener(name,cb){(listeners[name]||(listeners[name]=[])).push(cb)}};
class FD{constructor(form){this.f=form.fields||{}}get(key){return this.f[key]??''}}
vm.runInNewContext(source,{window:win,document:doc,FormData:FD,Date,Math,console,Set,navigator:{clipboard:{writeText:async()=>{}}},alert:()=>{throw Error('unexpected alert')},confirm:()=>true},{timeout:5000});
const mod=win.TradeFlowMarketing;assert.ok(mod?.configure&&mod?.render);
const data={marketingCampaigns:[],customers:[],settings:[{id:'growth-profiles-v1',icps:[{id:'p1',name:'Local property owners'}],personas:[{id:'b1',name:'Facility manager'}],activeIcpId:'p1'}],tasks:[]};
assert.ok(mod.render('marketing',data).includes('Marketing Studio'));
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
 assert.ok(app.includes("tab==='marketing'"));
 assert.ok(app.includes("'marketingCampaigns','crew','routePlans'"),'Marketing must have a real database store');
 assert.ok(app.includes('indexedDB.open(DB,9)'),'Marketing requires a browser storage migration');
 console.log('PASS: Marketing R04 offline drafts, ICP and persona links, review-request copy, real Tasks, no external send');
})().catch(err=>{console.error(err);process.exitCode=1});
