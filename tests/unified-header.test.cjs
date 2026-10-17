'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8'),
 html=fs.readFileSync('public/index.html','utf8'),
 css=fs.readFileSync('public/unified-header.css','utf8'),
 sw=fs.readFileSync('public/sw.js','utf8');
assert.ok(html.includes('./unified-header.css'),'Unified header styles linked');
assert.ok(sw.includes('./unified-header.css'),'Offline cache includes unified styles');
assert.ok(app.includes('function tfUnifiedHeader(d)'),'One shared brand header function');
assert.ok(app.includes('tfUnifiedHeader(data)'),'Shell uses unified header');
assert.ok(app.includes('tf-unified-wordmark'),'Brand wordmark present');
assert.ok(app.includes('tf-unified-header'),'Brand header included');
assert.ok(app.includes("window.TradeFlowNotifications?.home(d,tfHomeIcons.bell)"),'Notifications are available in the universal header on every page');
assert.ok(app.includes('tf-intel-summary')&&app.includes('tf-intel-actions'),'Universal header has concise and expanded horizontal intelligence states');
assert.ok(!app.includes('tf-ai-orb'),'Header must not add an AI orb');
const active=app.slice(app.indexOf('async function render()'));
assert.ok(!active.includes('<header class="top '),'Old inconsistent generic title header no longer active');
const homeStart=app.indexOf('tf-home tf-home-v2');
assert.ok(homeStart>0);
assert.ok(!app.slice(homeStart,homeStart+400).includes('<header class="tf-home-head">'),'Home avoids duplicate brand');
assert.ok(!app.includes('<header class="tf-more-header">'),'More avoids duplicate brand');
assert.ok(!app.includes('<div class="tf-map-brand">'),'Map avoids duplicate brand');
assert.ok(app.includes('data-action="mapFilters"'),'Map filters remain accessible');
assert.ok(app.includes('id="mapAddress"'),'Map search remains within map');
assert.ok(css.includes('.tf-unified-header')&&css.includes('.tf-unified-brand')&&css.includes('.tf-home-alert'));
assert.ok(app.includes("['preferences','Settings']"),'Settings remain available from the More menu configuration');
assert.ok(app.includes('data-op-ux="import"')&&app.includes('data-op-ux="export"'),'Import/export preserved');
assert.ok(app.includes('data-action="opportunityMapAll"'),'Map CTA preserved');
console.log('PASS: TradeFlow unified logo header, no duplicate branding or header search/menu, map and notification actions preserved');
