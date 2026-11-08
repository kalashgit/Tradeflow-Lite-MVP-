'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const adapter=fs.readFileSync('public/master-intelligence-reference.js','utf8');
const css=fs.readFileSync('public/master-intelligence-reference.css','utf8');
test('welcome orb runs Canvas2D on requestAnimationFrame and interpolates atlas frames',()=>{
 assert.match(adapter,/getContext\('2d'/);
 assert.match(adapter,/requestAnimationFrame\(frame\)/);
 assert.match(adapter,/const blend=fraction\*fraction\*\(3-2\*fraction\)/);
 assert.match(adapter,/drawImage\(image,sx,sy/);
 assert.match(adapter,/drawImage\(image,nx,ny/);
 assert.match(adapter,/dataset\.motionFrames=String\(paintCount\)/);
});
test('animated GIF remains fallback until actual frames are painted',()=>{
 assert.match(adapter,/dataset\.meshState='loading'/);
 assert.match(adapter,/dataset\.meshState='flowing'/);
 assert.match(adapter,/dataset\.meshState='fallback'/);
 assert.match(css,/\[data-mesh-state="flowing"\] canvas\.tf-master-live-mesh/);
 assert.match(css,/not\(\[data-mesh-state="flowing"\]\) canvas\.tf-master-live-mesh/);
});
test('orb pauses offscreen, respects reduced motion, and does not touch business commands',()=>{
 assert.match(adapter,/visibilitychange/);
 assert.match(adapter,/document\.hidden/);
 assert.match(adapter,/prefers-reduced-motion: reduce/);
 assert.doesNotMatch(adapter,/executeCommand\(/);
});
