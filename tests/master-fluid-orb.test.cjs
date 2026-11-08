'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const app=read('public/app.js'),adapter=read('public/master-intelligence-reference.js'),css=read('public/master-intelligence-reference.css');
test('only the AI welcome orb has 60-frame MP4 and GIF fallback',()=>{
 assert.match(app,/tf-master-orb-video/);
 assert.match(app,/tradeflow_orb_smooth_60_frames\.mp4/);
 assert.match(app,/tradeflow_orb_60_frames\.gif/);
 assert.match(app,/autoplay muted loop playsinline webkit-playsinline/);
 assert.match(app,/data-action="tfAiVoice"/);
});
test('video becomes visible only once playback has started and decoded a frame',()=>{
 assert.match(adapter,/requestVideoFrameCallback/);
 assert.match(adapter,/classList\.add\('video-ready'\)/);
 assert.match(adapter,/classList\.remove\('video-ready'\)/);
 assert.match(adapter,/video\.play\(\)/);
 assert.match(adapter,/dataset\.meshState='fallback'/);
 assert.match(css,/\.tf-master-orb\.video-ready \.tf-master-orb-video/);
});
test('welcome video only, with reduced-motion and legacy GIF safety',()=>{
 assert.match(css,/\.tf-master-welcome \.tf-master-orb-video/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(adapter,/\.\/orb-concept-b\/reference\.gif/);
 assert.doesNotMatch(adapter,/TradeFlowOrbIdle|globalCompositeOperation|createRenderer/);
 assert.doesNotMatch(adapter,/executeCommand\(/);
});
test('both real 60-frame media assets must be installed before shipping',()=>{
 const mp4='public/assets/tradeflow_orb_smooth_60_frames.mp4',gif='public/assets/tradeflow_orb_60_frames.gif';
 assert.ok(fs.existsSync(mp4),'Missing orb MP4: install the supplied media package');
 assert.ok(fs.existsSync(gif),'Missing orb GIF: install the supplied media package');
 assert.ok(fs.statSync(mp4).size>20000,'MP4 is suspiciously small');
 assert.ok(fs.statSync(gif).size>20000,'GIF is suspiciously small');
 assert.equal(fs.readFileSync(mp4).toString('ascii',4,8),'ftyp');
 assert.match(fs.readFileSync(gif).toString('ascii',0,6),/^GIF8[79]a$/);
});