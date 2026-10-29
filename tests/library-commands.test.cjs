const test=require('node:test');
const assert=require('node:assert/strict');
const commands=require('../public/library-commands.js');
test('library navigation works for spoken and typed utterances',()=>{
 for(const x of ['Open Library','Hey TradeFlow, open the library','Library'])assert.equal(commands.parse(x).action,'open');
});
test('bounded import intentions map to review only',()=>{
 assert.deepEqual(commands.parse('Import jobs from library'),{action:'showFiles',target:'jobs'});
 assert.deepEqual(commands.parse('Import panel-jobs.csv into jobs'),{action:'reviewSavedFile',filename:'panel-jobs.csv',target:'jobs'});
 assert.deepEqual(commands.parse('Review Customers.csv as customers'),{action:'reviewSavedFile',filename:'Customers.csv',target:'customers'});
});
test('document capture and manual upload use explicit on-screen controls',()=>{
 assert.equal(commands.parse('Scan document').action,'scan');
 assert.equal(commands.parse('Upload a file').action,'upload');
});
test('dangerous or non-specific actions fail closed',()=>{
 for(const x of ['Delete all jobs','Send invoices','Approve all imports','Import all jobs now','Export my data','Pay suppliers'])assert.equal(commands.parse(x),null);
});
