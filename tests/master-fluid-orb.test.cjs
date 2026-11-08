'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const adapter=fs.readFileSync('public/master-intelligence-reference.js','utf8');
const css=fs.readFileSync('public/master-intelligence-reference.css','utf8');
test('approved original membrane uses optical-flow shader, not multi-frame color blending',()=>{
 assert.match(adapter,/TradeFlowOrbIdle/);
 assert.match(adapter,/createRenderer\(canvas/);
 assert.match(adapter,/continuousFlow:true,referenceMode:true/);
 assert.doesNotMatch(adapter,/globalCompositeOperation='lighter'/);
 assert.doesNotMatch(adapter,/const weights=\[/);
});
test('canvas cannot replace source GIF without proof of changing rendered pixels',()=>{
 assert.match(adapter,/dataset\.meshState='loading'/);
 assert.match(adapter,/canvas\.toDataURL\('image\/png'\)/);
 assert.match(adapter,/changes>=2/);
 assert.match(adapter,/dataset\.meshState='flowing'/);
 assert.match(adapter,/dataset\.meshState='fallback'/);
 assert.match(css,/\[data-mesh-state="flowing"\] canvas\.tf-master-live-mesh/);
});
test('unsupported and reduced motion fallback; renderer disposed on navigation',()=>{
 assert.match(adapter,/prefers-reduced-motion: reduce/);
 assert.match(adapter,/renderer\?\.dispose\(\)/);
 assert.match(adapter,/MutationObserver\(sync\)/);
 assert.doesNotMatch(adapter,/executeCommand\(/);
});
