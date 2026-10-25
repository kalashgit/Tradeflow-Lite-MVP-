'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const more=require('../public/launch-more-commands.js');
test('seven launch More workspaces navigate to registered IDs',()=>{
 for(const [spoken,workspace] of [
  ['open opportunities','opportunities'],['open customers','customers'],['open quotations','quotes'],
  ['open jobs','jobs'],['open tasks','tasks'],['open invoices','invoices'],
  ['open target customers and buyer personas','growth']
 ])assert.deepEqual(more.parse(spoken),{action:'open',workspace});
});
test('task and quotation filters use existing registry',()=>{
 assert.deepEqual(more.parse('show overdue tasks'),{action:'filter',workspace:'tasks',filter:'overdue'});
 assert.deepEqual(more.parse('show completed tasks'),{action:'filter',workspace:'tasks',filter:'done'});
 assert.deepEqual(more.parse('show accepted quotations'),{action:'filter',workspace:'quotes',filter:'accepted'});
});
test('record lookup and reviewed drafts',()=>{
 assert.deepEqual(more.parse('find customer Michael Anderson'),{action:'find',store:'customers',query:'michael anderson'});
 assert.deepEqual(more.parse('open customer Michael Anderson'),{action:'openRecord',store:'customers',query:'michael anderson'});
 assert.deepEqual(more.parse('prepare quote'),{action:'draft',kind:'quote'});
 assert.deepEqual(more.parse('draft task'),{action:'draft',kind:'task'});
});
test('no interception of unrelated or sensitive requests',()=>{
 for(const cmd of ['open calendar','show unpaid invoices','send invoice','delete customer','charge card','set revenue target','book appointment'])
  assert.equal(more.parse(cmd),null,cmd);
});
