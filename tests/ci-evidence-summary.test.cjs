'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseVerification}=require('../scripts/summarize-ci-evidence.cjs');
const sha='a'.repeat(40);
const node='# tests 424\n# pass 424\n# fail 0\n# cancelled 0\n# skipped 0\n';
const browser='2/2 Chromium two-tab command concurrency scenarios passed; field acceptance unverified.\n20/20 Chromium workflow scenarios passed; contractor outcomes unverified.\n';
test('exact-head evidence summary records Node and independent browser counts',()=>{
 const result=parseVerification({sha,nodeLog:node,browserLog:browser});
 assert.equal(result.sha,sha);assert.equal(result.node.passed,424);
 assert.deepEqual(result.chromium.combined,{passed:22,total:22});
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
