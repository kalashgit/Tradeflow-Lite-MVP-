'use strict';
const assert=require('node:assert/strict');
const engine=require('../public/schedule-engine.js');
const monday='2026-10-19';
function base(){return {tasks:[],jobs:[],calendarEntries:[],calendarProposals:[],calendarPreferences:[]}}
{
 const d=base();d.tasks.push({id:'t1',title:'Prepare quote',due:'2026-10-20',durationMinutes:120,priority:'High',updatedAt:'a'});
 const result=engine.analyze(d,{today:monday});
 assert.equal(result.preferences.horizonDays,14);
 assert.equal(result.proposals.length,1);
 assert.equal(result.proposals[0].slots[0].time,'08:00');
 assert.equal(result.proposals[0].slots[0].durationMinutes,120);
 const twice=engine.analyze(d,{today:monday});
 assert.deepEqual(result.proposals,twice.proposals,'Proposals must be deterministic for a fixed snapshot');
}
{
 const d=base();
 d.jobs.push({id:'j1',date:monday,scheduleTime:'08:00',durationMinutes:180,assignedTo:'local-owner'});
 d.tasks.push({id:'t1',title:'Prepare quote',due:'2026-10-20',durationMinutes:120,priority:'High'});
 const slots=engine.analyze(d,{today:monday}).proposals[0].slots;
 assert.equal(slots[0].time,'11:15','The existing job plus 15-minute buffer must be respected');
}
{
 const d=base();
 d.tasks.push({id:'split',title:'Split quotation',due:monday,durationMinutes:180,splittable:true,minBlockMinutes:45});
 d.jobs.push({id:'j1',date:monday,scheduleTime:'09:00',durationMinutes:60});
 d.jobs.push({id:'j2',date:monday,scheduleTime:'12:00',durationMinutes:120});
 const result=engine.analyze(d,{today:monday});
 assert.equal(result.proposals.length,1);
 assert.ok(result.proposals[0].slots.length>=2,'Split a task only into valid free sessions');
 assert.equal(result.proposals[0].slots.reduce((n,x)=>n+x.durationMinutes,0),180);
 assert.ok(result.proposals[0].slots.every(x=>x.durationMinutes>=45));
}
{
 const d=base();d.tasks.push({id:'blocked',due:monday,title:'Install',durationMinutes:90,dependencies:['materials']});
 d.tasks.push({id:'materials',title:'Procure',due:monday,durationMinutes:30,status:'Open'});
 const result=engine.analyze(d,{today:monday});
 assert.ok(result.risks.some(x=>x.taskId==='blocked'&&/prerequisite/.test(x.reason)));
 assert.ok(!result.proposals.some(x=>x.taskId==='blocked'));
}
{
 const d=base();d.tasks.push({id:'late',title:'Late task',due:'2026-10-16',durationMinutes:60});
 const result=engine.analyze(d,{today:monday});
 assert.ok(result.risks.some(x=>x.taskId==='late'&&/deadline/.test(x.reason)));
 assert.equal(result.proposals.length,0);
}
{
 const d=base();d.tasks.push({id:'t2',title:'Prepare',due:'2026-10-21',durationMinutes:60});
 d.calendarPreferences.push({id:'local-owner',horizonDays:7,workdayStart:'09:00',workdayEnd:'16:00'});
 const result=engine.analyze(d,{today:monday});
 assert.equal(result.preferences.horizonDays,7);
 assert.equal(result.proposals[0].slots[0].time,'09:00');
 const prior=result.proposals[0];
 d.calendarProposals.push({id:'dismissed:'+prior.proposalKey,proposalKey:prior.proposalKey,status:'dismissed'});
 assert.equal(engine.analyze(d,{today:monday}).proposals.length,0,'Dismissals survive unchanged record snapshots');
}
{
 const d=base();
 d.tasks.push({id:'blocked-missing',title:'Installation',due:monday,durationMinutes:60,dependencies:['unrecorded-materials']});
 const result=engine.analyze(d,{today:monday});
 assert.equal(result.proposals.length,0,'Missing prerequisites are not assumed complete');
 assert.ok(result.risks.some(x=>x.taskId==='blocked-missing'));
}
{
 const d=base();
 d.tasks.push({id:'incomplete',title:'Preparation',due:'2026-10-20',durationMinutes:120,completedMinutes:0});
 d.calendarEntries.push({id:'old-session',sourceKind:'task',sourceId:'incomplete',date:'2026-10-16',time:'10:00',durationMinutes:90,status:'Scheduled'});
 const result=engine.analyze(d,{today:monday});
 assert.equal(result.proposals.length,1,'An unconfirmed past session must not count as completed work');
 assert.equal(result.proposals[0].remainingMinutes,120);
}
{
 const d=base();
 d.tasks.push({id:'uncertain',title:'Critical quotation',due:monday,durationMinutes:60});
 d.jobs.push({id:'unknown-duration',date:monday,scheduleTime:'10:00'});
 const result=engine.analyze(d,{today:monday});
 assert.equal(result.proposals.length,0,'Unknown-duration commitment must not be treated as free time');
 assert.ok(result.risks.some(x=>x.taskId==='uncertain'),'An unplaceable task is surfaced for review');
}

console.log('PASS: TradeFlow local scheduling engine, buffer, splitting, deadlines, dependencies, settings and dismissals');
