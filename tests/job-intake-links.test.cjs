const test=require('node:test');
const assert=require('node:assert/strict');
const links=require('../public/job-intake-links.js');
const base={id:'job-1',title:'Panel install',customerId:'customer-1',date:'2026-11-02',status:'Planned'};
const customer={address:'12 Main Street, Austin, TX 78701'};
test('valid imported time links the existing job to calendar, without creating duplicate event records',()=>{
 const result=links.augment(base,{scheduleTime:'09:30',durationMinutes:'90'},customer);
 assert.equal(result.record.scheduleTime,'09:30');
 assert.equal(result.record.durationMinutes,90);
 assert.equal(links.calendarVisible(result.record),true);
 assert.equal(result.record.address,customer.address);
 assert.equal(result.record.intakeMapStatus,'address_pending_review');
 assert.equal(result.record.calendarEntries,undefined);
});
test('date-only, undated and completed imported jobs remain outside appointment calendar',()=>{
 assert.equal(links.calendarVisible(links.augment(base,{},customer).record),false);
 assert.equal(links.calendarVisible(links.augment({...base,date:''},{},customer).record),false);
 assert.equal(links.calendarVisible(links.augment({...base,status:'Completed'},{scheduleTime:'11:00'},customer).record),false);
});
test('invalid dates, times and positions never become scheduled jobs',()=>{
 assert.match(links.augment(base,{scheduleTime:'25:00'},customer).error,/time/i);
 assert.match(links.augment({...base,date:''},{scheduleTime:'12:00'},customer).error,/date/i);
 assert.match(links.augment(base,{latitude:'94',longitude:'-97'},customer).error,/coordinates/i);
 assert.match(links.augment(base,{latitude:'30'},customer).error,/Both/i);
});
test('valid explicit coordinates are saved but not represented as verified',()=>{
 const result=links.augment(base,{latitude:'30.2672',longitude:'-97.7431'},customer);
 assert.deepEqual(result.record.coordinates,{latitude:30.2672,longitude:-97.7431});
 assert.equal(result.record.intakeMapStatus,'provided_unverified');
});
test('invalid duration is not replaced by invented value',()=>{
 assert.match(links.augment(base,{durationMinutes:'some time'},customer).error,/duration/i);
 assert.equal(links.augment(base,{},customer).record.durationMinutes,60);
});
