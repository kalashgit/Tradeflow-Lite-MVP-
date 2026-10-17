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
assert.ok(cal.render(d).includes('Calendar'));
assert.ok(!/fake|placeholder intelligence counts/i.test(cal.render(d)),'No fabricated scheduling insight counts');assert.ok(cal.render(d).includes('data-calendar-action="mode"'));
assert.ok(html.includes('calendar.js')&&html.includes('calendar.css'));
assert.ok(app.includes('window.TradeFlowCalendar?.render')&&app.includes("calendar:'Calendar'"));
assert.ok(app.includes("['calendar','Calendar']"));
assert.ok(app.includes('tfCalendarLinkedReturn')&&app.includes('completeSession:tfCompleteCalendarSession'),'Calendar must open linked records and complete sessions');
assert.ok(html.includes('schedule-engine.js')&&html.includes('calendar-r06'),'Scheduler is bundled in the versioned offline app');
const stores={tasks:{},jobs:{},calendarEntries:{},calendars:{},calendarPreferences:{},opportunities:{abc:{id:'abc',organization_name:'Office Plaza',city:'Austin',region:'TX'}}};
let uid=0,lastTab='',renderCount=0,notice='';
cal.configure({get:async(s,id)=>stores[s]?.[id],all:async s=>Object.values(stores[s]||{}),put:async(s,x)=>{stores[s][x.id]=x},del:async(s,id)=>{delete stores[s][id]},uid:()=>String(++uid),render:async()=>{renderCount++},notify:s=>notice=s,navigate:s=>lastTab=s});
async function run(){
 const click=events.click[0],submit=events.submit[0];
 await click({preventDefault(){},target:{dataset:{calendarAction:'mode',mode:'day'},closest(){return this}}});
 await click({preventDefault(){},target:{dataset:{calendarAction:'new'},closest(){return this}}});
 assert.ok(cal.render(d).includes('tfCalendarForm'));
 await submit({preventDefault(){},target:{id:'tfCalendarForm',fields:{title:'Site visit',date:'2026-10-16',time:'16:00',duration:'45',kind:'task',location:'Downtown Austin',description:'Meet client'}}});
 const saved=Object.values(stores.tasks)[0];assert.equal(saved.title,'Site visit');assert.equal(saved.due,'2026-10-16');assert.equal(saved.scheduleTime,'16:00');assert.equal(saved.kind,'appointment');
 assert.ok(notice.includes('Calendar'));assert.ok(cal.render({tasks:[saved],jobs:[]}).includes('Site visit'));
 await click({preventDefault(){},target:{dataset:{calendarAction:'opportunity',id:'abc'},closest(){return this}}});
 assert.equal(lastTab,'calendar');assert.ok(cal.render({tasks:[],jobs:[]}).includes('Office Plaza'));assert.ok(renderCount>=2);
 await click({preventDefault(){},target:{dataset:{calendarAction:'cancel'},closest(){return this}}});
 const live={
  tasks:[{id:'flex',title:'Draft quotation',due:'2026-10-20',status:'Open',priority:'High'}],
  jobs:[{id:'job-1',title:'Site inspection',date:'2026-10-19',scheduleTime:'09:00',durationMinutes:90,assignedTo:'Owner'},
        {id:'job-2',title:'Other job',date:'2026-10-19',scheduleTime:'10:00',durationMinutes:60,assignedTo:'Owner'}],
  calendarEntries:[{id:'evt-1',title:'Planning meeting',date:'2026-10-19',time:'13:00',durationMinutes:60,calendarId:'internal'}],
  calendars:[],calendarPreferences:[]
 };
 assert.equal(cal.records(live).length,4,'records remain linked rather than duplicated');
 assert.equal(cal.conflicts(live).length,1,'overlaps are detected for one assigned resource');
 assert.ok(cal.render(live).includes('tf-cal-timeline'),'Week / Day views have a real timed grid');
 assert.ok(cal.render(live).includes('Unscheduled work'),'Tasks without times go to planning queue');
 await click({preventDefault(){},target:{dataset:{calendarAction:'event',key:'job:job-1'},closest(){return this}}});
 const card=cal.render(live);
 assert.ok(card.includes('tf-cal-quick-card')&&card.includes('Open Job Record'),'Linked record is the primary event action');
 const quickPanel={inserted:'',querySelectorAll(){return []},insertAdjacentHTML(position,value){this.inserted=value}};
 document.querySelector=selector=>selector==='.tf-cal-page'?quickPanel:null;
 const beforeQuickRender=renderCount;
 await click({preventDefault(){},target:{dataset:{calendarAction:'event',key:'job:job-1'},closest(){return this}}});
 assert.ok(quickPanel.inserted.includes('Open Job Record'),'Fast quick card uses existing data');
 assert.equal(renderCount,beforeQuickRender,'Opening an event must not reload the entire app');
 delete document.querySelector;

 await click({preventDefault(){},target:{dataset:{calendarAction:'close-card'},closest(){return this}}});
 await click({preventDefault(){},target:{dataset:{calendarAction:'new'},closest(){return this}}});
 await submit({preventDefault(){},target:{id:'tfCalendarForm',fields:{title:'Standalone meeting',date:'2026-10-21',time:'14:00',duration:'60',kind:'event'}}});
 assert.equal(Object.keys(stores.calendarEntries).length,1,'Standalone event uses its own store, never activity log');
 await click({preventDefault(){},target:{dataset:{calendarAction:'schedule-settings'},closest(){return this}}});
 assert.ok(cal.render(live).includes('tfCalendarSettingsForm'),'Scheduling settings stay tucked away until requested');
 await submit({preventDefault(){},target:{
   id:'tfCalendarSettingsForm',fields:{horizonDays:'21',workdayStart:'07:00',workdayEnd:'18:00',bufferMinutes:'10',minBlockMinutes:'50'},
   querySelectorAll(){return [{value:'1'},{value:'2'},{value:'3'},{value:'4'},{value:'5'}]}
 }});
 assert.equal(stores.calendarPreferences['local-owner'].horizonDays,21,'Configurable planning horizon is persisted');
 assert.equal(stores.calendarPreferences['local-owner'].minBlockMinutes,50,'Business-wide minimum focus block is persisted');
 await click({preventDefault(){},target:{dataset:{calendarAction:'new'},closest(){return this}}});
 await submit({preventDefault(){},target:{id:'tfCalendarForm',fields:{
  title:'Prepare electrical proposal',date:'2026-10-23',duration:'120',kind:'task',priority:'High',splittable:'yes',minBlockMinutes:'60'
 }}});
 const flexible=Object.values(stores.tasks).find(t=>t.title==='Prepare electrical proposal');
 assert.ok(flexible&&flexible.splittable===true&&flexible.minBlockMinutes===60,'Task-level split rules persist without a separate appointment');
 assert.equal(flexible.calendarId,'tasks','New calendar tasks default to the semantic Task layer');

 const slot={dataset:{calendarAction:'direct-slot',date:'2026-10-21',firstHour:'7'},
  getBoundingClientRect(){return {top:0}},closest(){return this}};
 const initialCount=Object.keys(stores.calendarEntries).length;
 await click({clientY:384,preventDefault(){},target:slot});
 const created=Object.values(stores.calendarEntries).find(x=>x.date==='2026-10-21'&&x.time==='13:00');
 assert.ok(created,'Tapping an empty slot immediately persists a calendar entry');
 assert.equal(created.title,'New event');
 assert.equal(created.durationMinutes,60);
 assert.equal(created.status,'Scheduled');
 assert.equal(Object.keys(stores.calendarEntries).length,initialCount+1);
 await click({clientY:384,preventDefault(){},target:slot});
 assert.equal(Object.keys(stores.calendarEntries).length,initialCount+1,'Occupied time is not silently double-booked');
 const current=cal.render({...d,calendarEntries:Object.values(stores.calendarEntries)});
 assert.ok(current.includes('data-calendar-action="delete-event"'),'Standalone calendar blocks contain hold-to-reveal delete control');
 assert.ok(!current.includes('data-calendar-action="today"'),'Redundant Today button removed');
 assert.ok(!current.includes('id="tfCalDirectForm"'),'Direct slot creation never opens a form');
 await click({preventDefault(){},target:{dataset:{calendarAction:'delete-event',key:'event:'+created.id},closest(){return this}}});
 assert.ok(!stores.calendarEntries[created.id],'Delete control removes the persisted event after approval');

 console.log('PASS: TradeFlow Calendar R03 timeline, linked quick cards, layers, conflict detection and standalone events');
}
run().catch(err=>{console.error(err);process.exitCode=1});
