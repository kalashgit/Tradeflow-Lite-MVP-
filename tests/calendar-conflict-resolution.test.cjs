'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../public/core-integration.js'),commands=require('../public/command-registry.js');
const {createDB,snapshot,put}=require('./helpers/local-db.cjs');
require('../public/calendar.js');
const calendar=globalThis.TradeFlowCalendar,businessId='local-business';
const e1={id:'e1',title:'Customer walkthrough',date:'2026-11-05',time:'10:00',durationMinutes:90,
 assignedTo:'crew-a',status:'Scheduled',businessId};
const e2={id:'e2',title:'Second site visit',date:'2026-11-05',time:'10:30',durationMinutes:60,
 assignedTo:'crew-a',status:'Scheduled',businessId};
function fixture(){
 const db=createDB({calendarEntries:[e1,e2]});let counter=0;
 const context={actor:'local-owner',businessId,today:'2026-10-29'};
 const input={commandId:'calendar.conflict.reschedule',params:{ref:{store:'calendarEntries',id:'e1'},date:'2026-11-05',time:'13:00'}};
 const guard=async()=>commands.resolve(input,await snapshot(db),context).guard;
 const operate=async(extra={})=>core.execute({db,kind:'calendar.conflict.reschedule',
  payload:{eventId:'e1',date:'2026-11-05',time:'13:00'},uid:()=> 'operation-'+(++counter),
  requestKey:'owner-approved-calendar-change',actor:'local-owner',businessId,
  approved:true,recordGuard:await guard(),calendar,...extra});
 return {db,input,context,guard,operate};
}
test('approved standalone conflict move writes revised booking, command receipt, domain event and calendar audit',async()=>{
 const f=fixture(),before=await snapshot(f.db);
 assert.equal(calendar.conflicts(before,{from:'2026-11-05',until:'2026-11-05'}).length,1);
 const result=await f.operate(),after=await snapshot(f.db);
 assert.equal(result.id,'e1');assert.equal(result.verifiedNoConflict,true);
 assert.equal(after.calendarEntries.find(x=>x.id==='e1').time,'13:00');
 assert.equal(after.calendarEntries.find(x=>x.id==='e2').time,'10:30');
 assert.equal(calendar.conflicts(after,{from:'2026-11-05',until:'2026-11-05'}).length,0);
 assert.equal(after.calendarAudit.filter(x=>x.kind==='calendar.conflict.rescheduled').length,1);
 assert.equal(after.commandLog.filter(x=>x.kind==='calendar.conflict.reschedule').length,1);
 assert.equal(after.commandLog.filter(x=>x.kind==='domain.event'&&x.type==='calendar.updated').length,1);
});
test('same approved key idempotent; fresh approvals do not reschedule a non-conflicting event',async()=>{
 const f=fixture();const first=await f.operate(),again=await f.operate();
 assert.equal(again.id,first.id);assert.equal(again.reused,true);
 assert.equal((await snapshot(f.db)).calendarAudit.length,1);
 const current=await snapshot(f.db),resolved=commands.resolve(f.input,current,f.context);
 assert.equal(resolved.status,'needs_review');
 await assert.rejects(f.operate({requestKey:'different-approval',recordGuard:resolved.guard}),/no longer has a recorded conflict/);
 assert.equal((await snapshot(f.db)).calendarAudit.length,1);
});
test('same-resource collision, stale unrelated booking, denied approval and wrong business fail closed',async()=>{
 const f=fixture(),before=await snapshot(f.db),guard=await f.guard();
 await assert.rejects(f.operate({approved:false,recordGuard:guard}),/Approved standalone/);
 await assert.rejects(f.operate({businessId:'other-business',recordGuard:guard}),/unavailable in this business/);
 await assert.rejects(f.operate({payload:{eventId:'e1',date:'2026-11-05',time:'10:45'},recordGuard:guard}),/still conflicts/);
 assert.deepEqual(await snapshot(f.db),before);
 await put(f.db,'calendarEntries',{...e2,title:'Updated while owner reviews'});
 await assert.rejects(f.operate({recordGuard:guard}),/Calendar commitments changed since approval|Calendar record changed since approval/);
 assert.equal((await snapshot(f.db)).calendarAudit.length,0);
});
test('linked work sessions and after-midnight proposed slots cannot be moved via conflict command',async()=>{
 const f=fixture();await put(f.db,'calendarEntries',{...e1,sourceKind:'task',sourceId:'t1'});
 const invalid=commands.resolve(f.input,await snapshot(f.db),f.context);
 assert.equal(invalid.error.code,'INVALID_RECORD','Linked source must exist to be examined');
 const g=fixture(),late=commands.resolve({...g.input,params:{...g.input.params,time:'23:30'}},await snapshot(g.db),g.context);
 assert.equal(late.status,'invalid');assert.equal(late.error.code,'INVALID_DURATION');
});
test('storage interruption aborts every calendar change and audit entry together',async()=>{
 const f=fixture(),before=await snapshot(f.db);f.db.failPutOnce=true;
 await assert.rejects(f.operate(),/Simulated audit\/storage failure/);
 assert.deepEqual(await snapshot(f.db),before);
});
test('calendar conflict owner command prepares, approves, and verifies result on existing runtime',async()=>{
 const f=fixture();let seq=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(f.db),context:()=>f.context,
  uid:()=> 'command-'+(++seq),ledger:commands.createLedger(f.db),
  can:p=>p==='modify:calendar.conflict.reschedule',
  ports:{operation:async(kind,payload,proof)=>core.execute({db:f.db,kind,payload,
   uid:()=> 'calendar-audit-'+(++seq),calendar,actor:proof.actor,businessId:proof.businessId,
   requestKey:proof.requestKey,recordGuard:proof.recordGuard,approved:proof.approved})}});
 const plan=await runtime.prepare(f.input);
 assert.equal(plan.status,'needs_review');
 assert.equal((await runtime.execute(plan.id)).error.code,'APPROVAL_REQUIRED');
 assert.equal((await runtime.approve(plan.id)).status,'approved');
 const outcome=await runtime.execute(plan.id);
 assert.equal(outcome.status,'succeeded');assert.equal((await snapshot(f.db)).calendarAudit.length,1);
 const journal=(await snapshot(f.db)).commandLog.find(x=>x.id===plan.id);
 assert.deepEqual(journal.events.map(e=>e.type),['prepared','approved','executing','succeeded']);
});
test('existing calendar review interface routes via owner approval, not direct calendar put',()=>{
 const fs=require('node:fs');
 const app=fs.readFileSync('public/app.js','utf8'),ui=fs.readFileSync('public/calendar.js','utf8');
 assert.match(ui,/data-calendar-action="resolve-conflict"/);
 assert.match(ui,/await bridge\.resolveConflict/);
 assert.match(app,/commandId:'calendar\.conflict\.reschedule'/);
 assert.match(app,/commands\.approve\(plan\.id\)/);
});

test('crash after calendar record commit reconciles approved result without repeating the move',async()=>{
 const f=fixture(),db=f.db;let n=0,executions=0;
 const runtime=()=>commands.createRuntime({snapshot:()=>snapshot(db),
  context:()=>f.context,uid:()=> 'recovery-'+(++n),
  ledger:commands.createLedger(db),can:p=>p==='modify:calendar.conflict.reschedule',
  ports:{operation:()=>{executions++;throw Error('Recovery must not reschedule again')}}});
 const first=runtime(),p=await first.prepare(f.input);
 assert.equal(p.status,'needs_review');
 assert.equal((await first.approve(p.id)).status,'approved');
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'},{status:'executing'});
 const before=await snapshot(db);
 const guard=commands.resolve(f.input,before,f.context).guard;
 await core.execute({db,kind:'calendar.conflict.reschedule',payload:{eventId:'e1',date:'2026-11-05',time:'13:00'},
  uid:()=> 'calendar-audit-recovery',requestKey:'operation:'+p.id,recordGuard:guard,
  actor:'local-owner',businessId,approved:true,calendar});
 const next=runtime(),result=await next.reconcile(p.id);
 assert.equal(result.status,'succeeded');assert.equal(result.result.reconciled,true);
 assert.equal((await next.execute(p.id)).reused,true);
 assert.equal(executions,0);assert.equal((await snapshot(db)).calendarAudit.length,1);
 const saved=(await snapshot(db)).commandLog.find(x=>x.id===p.id);
 assert.equal(saved.status,'succeeded');
 assert.ok(saved.events.some(e=>e.type==='reconciled'));
});
test('calendar recovery does not claim success without matching domain and calendar audit',async()=>{
 const f=fixture(),db=f.db;let n=0;
 const runtime=commands.createRuntime({snapshot:()=>snapshot(db),context:()=>f.context,
  uid:()=> 'audit-'+(++n),ledger:commands.createLedger(db),
  can:p=>p==='modify:calendar.conflict.reschedule'});
 const p=await runtime.prepare(f.input);await runtime.approve(p.id);
 await commands.createLedger(db).transition(p.id,['approved'],{type:'executing'},{status:'executing'});
 const missing=await runtime.reconcile(p.id);
 assert.equal(missing.status,'indeterminate');assert.equal(missing.error.code,'RECEIPT_MISSING');
 const guard=commands.resolve(f.input,await snapshot(db),f.context).guard;
 await core.execute({db,kind:'calendar.conflict.reschedule',payload:{eventId:'e1',date:'2026-11-05',time:'13:00'},
  uid:()=> 'calendar-audit-1',requestKey:'operation:'+p.id,recordGuard:guard,
  actor:'local-owner',businessId,approved:true,calendar});
 const audit=(await snapshot(db)).calendarAudit[0];
 await new Promise((resolve,reject)=>{const tx=db.transaction('calendarAudit','readwrite');
  tx.objectStore('calendarAudit').delete(audit.id);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
 const result=await runtime.reconcile(p.id);
 assert.equal(result.status,'indeterminate');assert.equal(result.error.code,'AUDIT_UNVERIFIED');
 assert.equal((await runtime.execute(p.id)).status,'in_progress');
});
test('hidden calendar layers remain in conflict checks when moving standalone events',async()=>{
 const f=fixture(),db=f.db;
 await put(db,'calendarPreferences',{id:'local-owner',hiddenLayerIds:['internal']});
 const guard=await f.guard();
 await assert.rejects(f.operate({payload:{eventId:'e1',date:'2026-11-05',time:'10:45'},recordGuard:guard}),/still conflicts/);
 assert.equal((await snapshot(db)).calendarEntries.find(x=>x.id==='e1').time,'10:00');
});
