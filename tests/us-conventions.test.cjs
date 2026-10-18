'use strict';const test=require('node:test');const assert=require('node:assert/strict');const us=require('../public/us-conventions.js');
test('US currency defaults display dollars with US separators',()=>{assert.equal(us.LOCALE,'en-US');assert.equal(us.CURRENCY,'USD');assert.equal(us.money(1234.5),'$1,234.50')});
test('convert routing distances from km to US miles',()=>{assert.ok(Math.abs(us.miles(10)-6.2137119224)<0.00001);assert.ok(Math.abs(us.feet(100)-328.0839895)<0.0001)});
test('fahrenheit converter',()=>{assert.equal(us.fahrenheit(0),32);assert.equal(us.fahrenheit(100),212)});
test('US date formatting',()=>{assert.equal(us.date('2026-10-18T12:00:00Z',{timeZone:'UTC',year:'numeric',month:'numeric',day:'numeric'}),'10/18/2026')});
