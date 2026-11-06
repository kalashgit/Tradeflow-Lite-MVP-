const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {version,frameAt,normalizeSpeech}=require('../public/intelligence-orb-idle.js');
test('reference timing traverses every frame and interpolates last to first',()=>{
 assert.equal(version,'concept-b-v3');
 for(let i=0;i<9;i++)assert.ok(Math.abs(frameAt((i+.5)*.17).blend-.5)<1e-10);
 assert.deepEqual(frameAt(0),{index:0,blend:0});assert.equal(frameAt(8.5*.17).index,8);
 assert.ok(frameAt(9*.17).blend<1e-10);assert.equal(frameAt(-.085).index,8);
});
test('only versioned measured assistant playback raises speech energy',()=>{
 for(const source of ['microphone','simulator',undefined])assert.equal(normalizeSpeech({version:1,source,active:true,rms:1}),null);
 assert.equal(normalizeSpeech({version:2,source:'assistant_playback',active:true}),null);
 assert.deepEqual(normalizeSpeech({version:1,source:'assistant_playback',active:false,rms:1}),{active:false,level:0});
 const low=normalizeSpeech({version:1,source:'assistant_playback',active:true,rms:.02,peak:.1});
 const high=normalizeSpeech({version:1,source:'assistant_playback',active:true,rms:.15,peak:.5});assert.ok(high.level>low.level);
 assert.ok(Number.isFinite(normalizeSpeech({version:1,source:'assistant_playback',active:true,rms:NaN,peak:Infinity}).level));
});
test('renderer assets are version aligned and available offline',()=>{
 const html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
 for(const file of ['intelligence-orb-idle.js','intelligence-orb-idle.css']){assert.ok(html.includes(file+'?v=orb-concept-b-03'));assert.ok(sw.includes(file+'?v=orb-concept-b-03'));}
 for(const file of ['membrane.png','forward.png','backward.png','poster.png']){assert.ok(sw.includes('./orb-concept-b/'+file));assert.ok(fs.existsSync('public/orb-concept-b/'+file));}
 const manifest=JSON.parse(fs.readFileSync('public/orb-concept-b/manifest.json'));assert.equal(manifest.frames,9);assert.equal(manifest.frameMs,170);assert.equal(manifest.pairs.length,9);
});
