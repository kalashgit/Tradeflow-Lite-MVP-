'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const js=fs.readFileSync('public/calendar.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const events={},win={};
const document={addEventListener(k,h){(events[k]||(events[k]=[])).push(h)}};
class MockFormData{constructor(form){this.values=form.fields||{}}get(k){return this.values[k]||''}}
vm.runInNewContext(js,{window:win,document,FormData:MockFormData,Date,console,alert:()=>{throw Error('unexpected alert')}},{timeout:3000});
const cal=win.TradeFlowCalendar;
assert.ok(cal);
assert.equal(cal._test.validDate('2026-02-30'),false);
assert.equal(cal._test.validDate('2026-10-16'),true);
assert.equal(cal._test.shift('2026-10-01',-1),'2026-09-30');
assert.equal(cal._test.monday('2026-10-16'),'2026-10-12');
const d={tasks:[{id:'t1',title:'Client follow-up',due:'2026-10-16',status:'Open'}],jobs:[{id:'j1',title:'Electrical installation',date:'2026-10-16',status:'Planned'}]};
const entries=cal.records(d);assert.equal(entries.length,2);assert.equal(entries[0].date,'2026-10-16');
assert.ok(cal.render(d).includes('Calendar'));assert.ok(cal.render(d).includes('data-calendar-action="mode"'));
assert.ok(html.includes('calendar.js')&&html.includes('calendar.css'));
assert.ok(app.includes('window.TradeFlowCalendar?.render')&&app.includes("calendar:'Calendar'"));
assert.ok(app.includes("['calendar','Calendar']"));
const stores={tasks:{},opportunities:{abc:{id:'abc',organization_name:'Office Plaza',city:'Austin',region:'TX'}}};
let uid=0,lastTab='',renderCount=0,notice='';
cal.configure({get:async(s,id)=>stores[s]?.[id],put:async(s,x)=>{stores[s][x.id]=x},uid:()=>String(++uid),render:async()=>{renderCount++},notify:s=>notice=s,navigate:s=>lastTab=s});
async function run(){
 const click=events.click[0],submit=events.submit[0];
 await click({preventDefault(){},target:{dataset:{calendarAction:'mode',mode:'day'},closest(){return this}}});
 await click({preventDefault(){},target:{dataset:{calendarAction:'new'},closest(){return this}}});
 assert.ok(cal.render(d).includes('tfCalendarForm'));
 await submit({preventDefault(){},target:{id:'tfCalendarForm',fields:{title:'Site visit',date:'2026-10-16',time:'16:00',duration:'45',location:'Downtown Austin',description:'Meet client'}}});
 const saved=Object.values(stores.tasks)[0];assert.equal(saved.title,'Site visit');assert.equal(saved.due,'2026-10-16');assert.equal(saved.scheduleTime,'16:00');assert.equal(saved.kind,'appointment');
 assert.ok(notice.includes('Calendar'));assert.ok(cal.render({tasks:[saved],jobs:[]}).includes('Site visit'));
 await click({preventDefault(){},target:{dataset:{calendarAction:'opportunity',id:'abc'},closest(){return this}}});
 assert.equal(lastTab,'calendar');assert.ok(cal.render({tasks:[],jobs:[]}).includes('Office Plaza'));assert.ok(renderCount>=2);
 console.log('PASS: TradeFlow Calendar R02 day/week/month, appointments, task storage, and opportunity scheduling');
}
run().catch(err=>{console.error(err);process.exitCode=1});
