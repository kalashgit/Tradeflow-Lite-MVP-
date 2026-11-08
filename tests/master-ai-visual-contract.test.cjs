const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const read=name=>readFileSync(new URL('../public/'+name,'file://'+__filename),'utf8');

test('welcome uses the real brand mark and approved video-backed membrane',()=>{
 const app=read('app.js');
 const css=read('master-intelligence.css');
 assert.match(app,/class="tf-master-mark" src="\.\/brand\/tradeflow-mark\.svg"/);
 assert.match(app,/class="tf-master-orb-video" autoplay muted loop playsinline/);
 assert.match(app,/tradeflow_orb_smooth_60_frames\.mp4/);
 assert.match(app,/class="tf-master-orb-gif-fallback"/);
 assert.match(css,/\.tf-master-orb-mesh\{display:block;width:100%;height:100%;object-fit:contain/);
 assert.doesNotMatch(css,/repeating-radial-gradient/);
});

test('welcome stays four-wide on phone and chat keeps the same source-backed thread',()=>{
 const app=read('app.js');
 const css=read('master-intelligence.css');
 assert.match(css,/@media\(max-width:650px\)[\s\S]*?\.tf-master-starters\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(app,/const messages=tfChatMessages\.map/);
 assert.match(app,/tfAiReferencePlainText\(m\.content\)/);
 assert.match(app,/id="tfAiChatForm" class="tf-master-compose"/);
});

test('speech options mount in Settings without blocking the welcome screen',()=>{
 const speech=read('ai-speech.js');
 assert.match(speech,/document\.querySelector\('\[data-tf-voice-settings-host\]'\)/);
 assert.match(speech,/if\(options\)options\.append\(controls\)/);
 assert.match(speech,/data-ai-speech-speaker/);
 assert.match(speech,/data-ai-wake-toggle/);
});
