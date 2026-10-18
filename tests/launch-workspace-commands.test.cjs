'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const commands=require('../public/launch-workspace-commands.js');
test('calendar navigation and read-only filters',()=>{
 assert.deepEqual(commands.parse('Open calendar'),{area:'calendar',action:'open'});
 assert.deepEqual(commands.parse("Show today's schedule"),{area:'calendar',action:'date',offset:0});
 assert.deepEqual(commands.parse("Show tomorrow's calendar"),{area:'calendar',action:'date',offset:1});
 assert.deepEqual(commands.parse('Show calendar conflicts'),{area:'calendar',action:'filter',filter:'conflicts'});
 assert.deepEqual(commands.parse('Show calendar proposals'),{area:'calendar',action:'filter',filter:'proposals'});
});
test('finance and invoice views',()=>{
 assert.deepEqual(commands.parse('Open finance'),{area:'finance',action:'screen',screen:'overview'});
 assert.deepEqual(commands.parse('Show income'),{area:'finance',action:'screen',screen:'income'});
 assert.deepEqual(commands.parse('Show finance reports'),{area:'finance',action:'screen',screen:'reports'});
 assert.deepEqual(commands.parse('Show last 7 days'),{area:'finance',action:'period',period:'week'});
 assert.deepEqual(commands.parse('Show unpaid invoices'),{area:'invoices',action:'filter',filter:'unpaid'});
 assert.deepEqual(commands.parse('Show overdue invoices'),{area:'invoices',action:'filter',filter:'overdue'});
});
test('no unrelated command interception',()=>{
 for(const phrase of ['Show overdue tasks','Open customers','Create a customer','Show job costs','Prepare quote','Delete invoice','Pay supplier'])
  assert.equal(commands.parse(phrase),null,phrase);
});
