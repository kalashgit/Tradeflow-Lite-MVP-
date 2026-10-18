'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const map=require('../public/launch-map-commands.js');
test('launch map navigation',()=>{
 assert.deepEqual(map.parse('Open map'),{kind:'open'});
 assert.deepEqual(map.parse('Open the map page'),{kind:'open'});
 assert.deepEqual(map.parse('Hey TradeFlow, open map'),{kind:'open'});
});
test('launch map read-only controls',()=>{
 assert.deepEqual(map.parse('Show my location'),{kind:'location'});
 assert.deepEqual(map.parse('Show map layers'),{kind:'layers'});
 assert.deepEqual(map.parse('Clear map route'),{kind:'clearRoute'});
 assert.deepEqual(map.parse('Show headquarters on the map'),{kind:'headquarters'});
 assert.deepEqual(map.parse('Switch map to terrain'),{kind:'mode',mode:'terrain'});
 assert.deepEqual(map.parse('Search map for 123 Main Street Austin'),{kind:'search',query:'123 Main Street Austin'});
});
test('map parser cannot intercept other business operations',()=>{
 for(const phrase of ['Show overdue tasks','Open customers','Prepare quote','Find customer Mike','Show unpaid invoices','Add job','Delete customer','Send email'])
  assert.equal(map.parse(phrase),null,phrase);
});
