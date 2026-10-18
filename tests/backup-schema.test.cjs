'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../public/backup-schema.js');
const stores=['customers','jobs','tasks','calendarEntries'];
const ok={format:'tradeflow-lite',version:9,stores:{customers:[{id:'a',name:'A'}],jobs:[],tasks:[{id:'t'}],calendarEntries:[]}};
test('accepts a valid complete backup',()=>{const x=validate(ok,stores);assert.equal(x.recordCount,2);assert.equal(x.stores.customers[0].name,'A')});
test('rejects missing current stores and duplicate ids',()=>{
 assert.throws(()=>validate({...ok,stores:{customers:[],jobs:[],tasks:[]}},stores),/calendarEntries/);
 assert.throws(()=>validate({...ok,stores:{...ok.stores,customers:[{id:'a'},{id:'a'}]}},stores),/duplicate/);
});
test('rejects unsupported formats and malformed data before database writes',()=>{
 assert.throws(()=>validate({...ok,format:'wrong'},stores),/format/);
 assert.throws(()=>validate({...ok,version:10},stores),/format/);
 assert.throws(()=>validate({...ok,stores:{...ok.stores,customers:[{name:'missing id'}]}},stores),/Invalid/);
});
test('legacy version 8 may omit later calendar stores',()=>{const x=validate({...ok,version:8,stores:{customers:[],jobs:[],tasks:[]}},stores);assert.deepEqual(x.stores.calendarEntries,[])});
