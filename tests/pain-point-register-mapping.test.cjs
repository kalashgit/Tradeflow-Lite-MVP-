'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('../automation/ten-pain-points.json');
const originalRows=Object.freeze({
 'TF-P01':2,'TF-P02':11,'TF-P03':13,'TF-P04':9,'TF-P05':12,
 'TF-P06':7,'TF-P07':22,'TF-P08':4,'TF-P09':38,'TF-P10':61
});
test('ten candidate scenarios retain exact original research references',()=>{
 assert.equal(manifest.targets.length,10);
 assert.deepEqual(Object.fromEntries(manifest.targets.map(item=>[item.id,item.originalRegisterRef])),originalRows);
 assert.equal(manifest.researchRegister.originalEntryCount,62);
});
test('adjacent and partial mappings cannot silently represent full problem closure',()=>{
 const byId=Object.fromEntries(manifest.targets.map(item=>[item.id,item]));
 assert.match(byId['TF-P05'].mappingScope,/partial/);
 assert.match(byId['TF-P07'].mappingScope,/adjacent/);
 assert.match(manifest.description,/not contractor acceptance/);
});
