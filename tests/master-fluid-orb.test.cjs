'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const adapter=fs.readFileSync('public/master-intelligence-reference.js','utf8');
const css=fs.readFileSync('public/master-intelligence-reference.css','utf8');
test('welcome orb runs Canvas2D on requestAnimationFrame and interpolates atlas frames',()=>{
 assert.match(adapter,/getContext\('2d'/);
 assert.match(adapter,/requestAnimationFrame\(frame\)/);
 assert.match(adapter,/const weights=\[/);
 assert.match(adapter,/t3\/6\]/);
 assert.match(adapter,/globalCompositeOperation='lighter'/);
 assert.match(adapter,/for\(let k=0;k<4;k\+\+\)/);
 assert.match(adapter,/context\.drawImage\(image,\(frameIndex%3\)/);
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

test('floating membrane eliminates the square asset backing in canvas and GIF fallback',()=>{
 assert.match(css,/\.tf-master-orb \.tf-master-orb-mesh,/);
 assert.match(css,/\.tf-master-orb canvas\.tf-master-live-mesh/);
 assert.match(css,/-webkit-mask-image:radial-gradient/);
 assert.match(css,/mask-image:radial-gradient/);
 assert.match(css,/transparent 49\.8%/);
});
