'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=f=>fs.readFileSync(f,'utf8');
test('existing Home brand is intercepted for alternate view without changing default navigation',()=>{
 const app=read('public/app.js'),c=read('public/command-constellation.js');
 assert.match(app,/class="tf-unified-brand" data-tab="dashboard"/);
 assert.match(c,/\.tf-home-header \.tf-unified-brand/);
 assert.match(c,/stopImmediatePropagation\(\)/);
 assert.match(c,/function close\(\)/);
 assert.match(c,/data-cclose/);
});
test('constellation offers real route targets and no invented customer statuses',()=>{
 const app=read('public/app.js'),c=read('public/command-constellation.js');
 for(const route of ['jobs','customers','quotes','opportunities','dispatch','calendar','invoices','expenses','profitability','marketing','library','integrations','research']){
  assert.ok(app.includes(route+":" )||app.includes("'"+route+"'"),route);
  assert.ok(c.includes("'"+route+"'"),route);
 }
 assert.match(c,/Not assessed on this map/);
 assert.doesNotMatch(c,/Rebalance crew allocation and clear 3 overdue jobs/);
 assert.match(c,/const planned=!n\[4\]/);
 assert.match(c,/title="Planned section"/);
});
test('new assets are included in the existing runtime without replacing core app',()=>{
 const html=read('public/index.html');
 for(const file of ['command-constellation.js','command-constellation.css'])assert.ok(html.includes('./'+file));
 assert.match(read('public/command-constellation.css'),/prefers-reduced-motion/);
 assert.match(read('public/command-constellation.js'),/event\.key==='Escape'/);
 assert.match(read('public/command-constellation.js'),/originFocus\?\.focus/);
});
