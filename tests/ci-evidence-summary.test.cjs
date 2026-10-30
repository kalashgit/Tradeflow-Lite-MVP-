'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseVerification}=require('../scripts/summarize-ci-evidence.cjs');
const sha='a'.repeat(40);
const node='# tests 424\n# pass 424\n# fail 0\n# cancelled 0\n# skipped 0\n';
const browser='2/2 Chromium two-tab command concurrency scenarios passed; field acceptance unverified.\n20/20 Chromium workflow scenarios passed; contractor outcomes unverified.\n2/2 Chromium authorized intelligence context scenarios passed; synthetic identity/database, no business writes.\n2/2 Chromium authenticated two-device sync scenarios passed; synthetic identity and SQLite, no live cloud.\n';
test('exact-head evidence summary records Node and independent browser counts',()=>{
 const result=parseVerification({sha,nodeLog:node,browserLog:browser});
 assert.equal(result.sha,sha);assert.equal(result.node.passed,424);
 assert.deepEqual(result.chromium.combined,{passed:26,total:26});
 assert.equal(result.syntheticOnly,true);assert.equal(result.painPointsRetired,0);
});
test('missing or failed/skipped regressions cannot be summarized as green',()=>{
 for(const invalid of [node.replace('# fail 0','# fail 1'),node.replace('# pass 424','# pass 423'),
  node.replace('# skipped 0','# skipped 1'),node.replace('# cancelled 0','# cancelled 1')]){
  assert.throws(()=>parseVerification({sha,nodeLog:invalid,browserLog:browser}));
 }
});
test('missing cross-tab, contractor or incomplete browser evidence fails closed',()=>{
 for(const invalid of ['',browser.replace('2/2 Chromium','1/2 Chromium'),
  browser.replace('20/20 Chromium','19/20 Chromium'),browser.split('\n')[0]]){
  assert.throws(()=>parseVerification({sha,nodeLog:node,browserLog:invalid}));
 }
 assert.throws(()=>parseVerification({sha:'not-a-sha',nodeLog:node,browserLog:browser}));
});

test('missing or partial intelligence-context browser evidence cannot pass the expanded summary gate',()=>{
 for(const invalid of [browser.replace(/2\/2 Chromium authorized intelligence[^\n]+\n/,''),browser.replace('2/2 Chromium authorized','1/2 Chromium authorized')])assert.throws(()=>parseVerification({sha,nodeLog:node,browserLog:invalid}));
});

test('missing or partial authenticated two-device evidence is a failing gate',()=>{
 for(const invalid of [browser.replace(/2\/2 Chromium authenticated two-device[^\n]+\n/,''),browser.replace('2/2 Chromium authenticated two-device','1/2 Chromium authenticated two-device')])assert.throws(()=>parseVerification({sha,nodeLog:node,browserLog:invalid}));
});
