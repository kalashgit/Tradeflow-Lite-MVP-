'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const renderer=fs.readFileSync('public/intelligence-orb-idle.js','utf8');
const adapter=fs.readFileSync('public/master-intelligence-reference.js','utf8');
const css=fs.readFileSync('public/master-intelligence-reference.css','utf8');
test('welcome renderer opts into continuously flowing optical transport',()=>{
 assert.match(adapter,/continuousFlow:true,referenceMode:true/);
 assert.match(renderer,/continuousFlow\?Math\.max\(\.35,energy\):energy/);
 assert.match(renderer,/continuousFlow\?1-\.15\*speechPresence:1-\.82\*speechPresence/);
 assert.match(renderer,/reference\|\|referenceMode/);
});
test('fallback GIF remains displayed until renderer reports ready',()=>{
 assert.match(adapter,/dataset\.meshState='loading'/);
 assert.match(adapter,/onReady:/);
 assert.match(adapter,/dataset\.meshState='flowing'/);
 assert.match(css,/\[data-mesh-state="flowing"\] canvas\.tf-master-live-mesh/);
 assert.match(css,/not\(\[data-mesh-state="flowing"\]\) canvas\.tf-master-live-mesh/);
});
test('reduced-motion preference is respected and no voice command authority introduced',()=>{
 assert.match(renderer,/reduced\?\.matches\?0:/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(adapter,/\.executeCommand\(/);
});
