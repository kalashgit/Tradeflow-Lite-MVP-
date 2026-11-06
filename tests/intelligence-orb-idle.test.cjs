const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');
const {version,contour,membranePoint,normalizeSpeech}=require('../public/intelligence-orb-idle.js');
test('Concept B replaces old woven-blue implementation',()=>{
 assert.equal(version,'concept-b-v2');
 const js=fs.readFileSync('public/intelligence-orb-idle.js','utf8');
 assert.ok(!js.includes('woven-blue-v10'));
 assert.ok(js.includes('tf-orb-concept-b-emblem'));
 assert.ok(js.includes('tradeflow:speech-features'));
 assert.equal(js.includes('getUserMedia('),false);
 assert.equal(js.includes('speechSynthesis.speak('),false);
});
test('idle mesh stays organically moving but bounded',()=>{
 for(const t of [0,1,3,7,12])for(let i=0;i<36;i++){
  const r=contour(i*Math.PI/18,t);assert.ok(r>.75&&r<.99);
 }
 assert.notDeepEqual(membranePoint(.2,.3,0),membranePoint(.2,.3,3));
 assert.notEqual(contour(1.2,0),contour(1.2,3));
});
test('real measured assistant playback is sole source of speech lighting',()=>{
 assert.equal(normalizeSpeech({source:'microphone',version:1,active:true,rms:1}),null);
 assert.equal(normalizeSpeech({source:'assistant_playback',version:1,active:false,rms:1}).level,0);
 assert.ok(normalizeSpeech({source:'assistant_playback',version:1,active:true,rms:.12,peak:.2}).level>.18);
 assert.equal(normalizeSpeech({source:'assistant_playback',version:1,active:true,rms:0,peak:0}).active,true);
});
test('HTML and offline precache load exact Concept B renderer and styles',()=>{
 const html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
 for(const name of ['intelligence-orb-idle.js?v=orb-concept-b-02','intelligence-orb-idle.css?v=orb-concept-b-02']){
  assert.ok(html.includes(name),name+' in HTML');assert.ok(sw.includes(name),name+' in SW');
 }
 assert.ok(!html.includes('orb-idle-15'));
 assert.ok(!sw.includes('orb-idle-15'));
 const app=fs.readFileSync('public/app.js','utf8');
 assert.ok(app.includes('data-action="tfAiToggle"'));
});
