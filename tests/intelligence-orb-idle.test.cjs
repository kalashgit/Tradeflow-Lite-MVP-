const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {surfaceRadius,meshPoint,version}=require('../public/intelligence-orb-idle.js');

test('living orb has bounded, non-uniform local folds without a large global pulse',()=>{
  const samples=[];
  for(const time of [0,1,2.5,5,11,17.5]){
    const radius=[];
    for(let i=0;i<360;i++){
      const r=surfaceRadius(i*Math.PI/180,time);
      assert.ok(r>.76&&r<.85,JSON.stringify({i,time,r}));
      radius.push(r);
    }
    samples.push(radius.reduce((a,b)=>a+b,0)/radius.length);
    assert.ok(Math.max(...radius)-Math.min(...radius)>.02);
  }
  assert.ok(Math.max(...samples)-Math.min(...samples)<.0025,'stable mean radius even when folds travel');
});

test('fine threads move coherently but change over time',()=>{
  const a=meshPoint(.12,.18,0), b=meshPoint(.12,.185,0), later=meshPoint(.12,.18,4);
  assert.ok(Math.abs(a[1]-b[1])<.02,'adjacent threads stay adjacent');
  assert.notDeepEqual(a,later,'mesh advection should be time-dependent');
  for(const x of [-.8,0,.8]) for(const y of [-.8,0,.8]){
    const [xx,yy]=meshPoint(x,y,3.7);
    assert.ok(Number.isFinite(xx)&&Number.isFinite(yy));
    assert.ok(Math.abs(xx-x)<.045);
    assert.ok(Math.abs(yy-y)<.085);
  }
});

test('fold illumination is shaped by current geometry instead of a fixed halo',()=>{
  const {foldLight}=require('../public/intelligence-orb-idle.js');
  const light=[0,.25,.5,1,2,3,4,5].map(a=>foldLight(a,3));
  assert.ok(light.every(v=>v>=0&&v<=1));
  assert.ok(Math.max(...light)-Math.min(...light)>.08,'local folds must affect illumination');
  assert.notDeepEqual(light,[0,.25,.5,1,2,3,4,5].map(a=>foldLight(a,9)));
});

test('mesh renderer remains a visual layer and does not start voice or workflows',()=>{
  const source=fs.readFileSync('public/intelligence-orb-idle.js','utf8');
  assert.equal(version,'idle-mesh-v2');
  assert.equal(source.includes('createRadialGradient'),false,'no glossy sphere gradient');
  for(const term of ['getUserMedia(', 'SpeechRecognition(', 'speechSynthesis.speak(', 'navigator.vibrate(', 'fetch(', 'WebGLRenderingContext', 'localStorage.']){
    assert.equal(source.includes(term),false,'unexpected side effect: '+term);
  }
});

test('app and offline precache reference exact new mesh artifacts',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const sw=fs.readFileSync('public/sw.js','utf8');
  for(const asset of ['intelligence-orb-idle.js?v=orb-idle-04','intelligence-orb-idle.css?v=orb-idle-04']){
    assert.ok(html.includes(asset),asset+' in index');
    assert.ok(sw.includes(asset),asset+' in offline cache');
  }
  assert.ok(fs.existsSync('public/intelligence-orb-idle.css'));
  assert.ok(html.indexOf('intelligence-orb-idle.js?v=orb-idle-04')<html.indexOf('<script type="module" src="./app.js'));
});

test('existing Intelligence action is preserved; only decorative icon becomes hidden',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/intelligence-orb-idle.css','utf8');
  assert.ok(app.includes('data-action="tfAiToggle"'));
  assert.ok(app.includes('tfAiOverlayView'));
  assert.ok(css.includes('.tf-ai-orb-icon'));
  assert.ok(css.includes('display:none!important'));
  assert.ok(css.includes('fine-mesh-v2'));
});
