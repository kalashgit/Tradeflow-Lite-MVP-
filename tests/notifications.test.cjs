'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/notifications.js','utf8');
const app=fs.readFileSync('public/app.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),
 sw=fs.readFileSync('public/sw.js','utf8'),css=fs.readFileSync('public/notifications.css','utf8');
const events={},win={};
const document={
 addEventListener:(type,handler)=>{(events[type]||(events[type]=[])).push(handler)},
 querySelector:()=>({focus(){}})
};
vm.runInNewContext(source,{window:win,document,Date,Set,Math,console,Number,alert:msg=>{throw Error(msg)}},{timeout:3000});
const mod=win.TradeFlowNotifications;assert.ok(mod?.home&&mod?.configure&&mod?.bootstrap);
const {generate,itemsWithRead,KEY}=mod._test;
const NOW=new Date('2026-10-16T12:00:00').getTime(),today='2026-10-16';
const data={
 settings:[],tasks:[
  {id:'task1',title:'Follow up customer',due:today,status:'Open'},
  {id:'task2',title:'Tomorrow not due',due:'2026-10-17',status:'Open'},
  {id:'task3',title:'Completed today',due:today,status:'Done'},
  {id:'mission1',title:'Review Google listing',due:today,missionOrigin:'growth',status:'Open',createdAt:'2026-10-16T09:10:00Z'}
 ],quotes:[],opportunities:[],events:[{id:'old',text:'Quote created',date:'2026-10-15T12:00:00Z'}]
};
const fresh=generate(data,NOW);
assert.ok(fresh.some(x=>x.id==='priority:task:task1|'+today&&x.route==='tasks'));
assert.ok(!fresh.some(x=>x.id.includes('task2')||x.id.includes('task3')));
assert.ok(fresh.some(x=>x.id==='growth:mission:mission1'&&x.route==='missions'));
assert.ok(fresh.some(x=>x.id==='growth:setup-icp:v1'&&x.route==='growth'));
assert.ok(fresh.some(x=>x.id==='activity:event:old'&&x.route==='quotes'));
assert.equal(fresh.filter(x=>x.id.includes('mission1')).length,1,'Mission must not also duplicate priority task');
const stores={settings:data.settings};let navigated='',writes=0;
const bridge={
 put:async(store,row)=>{assert.equal(store,'settings');writes++;const idx=stores.settings.findIndex(x=>x.id===row.id);
  if(idx<0)stores.settings.push(row);else stores.settings[idx]=row;},
 get:async(store,id)=>stores.settings.find(x=>x.id===id),
 render:async()=>{mod.home(data,'<svg></svg>');},
 navigate:async route=>{navigated=route}
};
mod.configure(bridge);
(async()=>{
 await mod.bootstrap(data);
 assert.equal(writes,1);assert.ok(stores.settings.find(x=>x.id===KEY));
 await mod.bootstrap(data);assert.equal(writes,1,'State initialized once');
 assert.ok(!itemsWithRead(data,NOW).find(x=>x.id==='activity:event:old').unread,'Historical events cannot trigger unread dot');
 const bell=mod.home(data,'<svg aria-hidden="true"></svg>');
 assert.ok(bell.includes('data-notif-action="toggle"'));
 assert.ok(bell.includes('<i aria-hidden="true"></i>'),'Unread actionable work shows dot');
 assert.ok(!bell.includes('data-tab="tasks"'),'Bell must open notification panel rather than Tasks directly');
 const action=async(action,id)=>await events.click[0]({
  preventDefault(){},stopImmediatePropagation(){},
  target:{closest:selector=>selector==='[data-notif-action]'?{dataset:{notifAction:action,notifId:id}}:null}
 });
 await action('toggle');
 const panel=mod.home(data,'<svg></svg>');
 for(const label of ['PRIORITY','GROWTH INTELLIGENCE','ACTIVITY'])assert.ok(panel.includes(label));
 assert.ok(panel.includes('Mark all read'));
 await action('go','priority:task:task1|'+today);
 assert.equal(navigated,'tasks','Notification must route to correct module');
 assert.ok(stores.settings[0].seen.includes('priority:task:task1|'+today));
 await action('toggle');
 await action('read-all');
 assert.equal(itemsWithRead(data,NOW).filter(x=>x.unread).length,0,'Mark all read must clear indicator');
 assert.ok(!mod.home(data,'<svg></svg>').includes('<i aria-hidden="true"></i>'));
 await action('toggle');await action('toggle');
 assert.equal(itemsWithRead(data,NOW).filter(x=>x.unread).length,0);
 const newAt=new Date(Date.now()+1500).toISOString();
 data.events.push({id:'new',date:newAt,text:'Job scheduled'});
 const next=itemsWithRead(data,Date.now()+2000);
 assert.equal(next.find(x=>x.id==='activity:event:new').unread,true);
 assert.ok(mod.home(data,'<svg></svg>').includes('<i aria-hidden="true"></i>'));
 assert.equal(next.find(x=>x.id==='activity:event:old').unread,false);
 data.tasks[0].status='Done';
 assert.ok(!generate(data,NOW).some(x=>x.id.includes('task1')));
 const none={settings:[{id:KEY,startedAt:'2026-10-01T00:00:00Z',seen:['growth:setup-icp:v1']}],
 tasks:[],events:[],opportunities:[],quotes:[]};
 assert.ok(!mod.home(none,'<svg></svg>').includes('<i aria-hidden="true"></i>'),'No permanent red badge');
 assert.ok(html.includes('./notifications.js')&&html.includes('./notifications.css'));
 assert.ok(sw.includes('./notifications.js')&&sw.includes('./notifications.css'));
 assert.ok(css.includes('.tf-notif-panel')&&css.includes('tf-notif-status'));
 assert.ok(!app.includes('window.TradeFlowGrowth?.homePanel(d)'),'Home must not show added Growth Intelligence card');
 assert.ok(app.includes('window.TradeFlowNotifications?.home(d,tfHomeIcons.bell)'));
 assert.ok(!source.includes('fetch('),'Only real local records, no fake remote push');
 console.log('PASS: notification groups, unread-only bell dot, saved read state, routing and uncluttered Home');
})().catch(err=>{console.error(err);process.exitCode=1});
