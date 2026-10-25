'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const more=require('../public/launch-more-commands.js');
const work=require('../public/launch-workspace-commands.js');
test('reported failed requests now have routed intents',()=>{
 const cases=[
 ['Show John Smith details',{action:'openRecord',store:'customers',query:'john smith'}],
 ['Find John Smith',{action:'find',query:'john smith'}],
 ['Show active jobs',{action:'activeJobs'}],
 ['Create a task to call John Smith tomorrow',{action:'taskDraft',title:'call john smith',when:'tomorrow'}],
 ['Mark this task done',{action:'completeTask'}],
 ["Find John's job location",{action:'jobLocation',person:'john'}]
 ];
 for(const [input,expected] of cases)assert.deepEqual(more.parse(input),expected,input);
 assert.deepEqual(work.parse("Show this month's income"),{area:'finance',action:'incomeMonth'});
 assert.deepEqual(work.parse('Show outstanding invoices'),{area:'invoices',action:'filter',filter:'unpaid'});
});
test('normal existing voice commands still parse',()=>{
 assert.deepEqual(more.parse('Open customers'),{action:'open',workspace:'customers'});
 assert.deepEqual(more.parse('Show overdue tasks'),{action:'filter',workspace:'tasks',filter:'overdue'});
 assert.deepEqual(work.parse('Open finance'),{area:'finance',action:'screen',screen:'overview'});
});
test('sensitive operations are not automatically interpreted as read-only',()=>{
 for(const command of ['Delete customer John Smith','Pay John Smith $250','Send invoice to John Smith','Charge card'])
  assert.equal(more.parse(command),null,command);
});
