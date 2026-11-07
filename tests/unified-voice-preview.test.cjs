'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const read=name=>readFileSync(join(__dirname,'..',name),'utf8');

test('unified Master Intelligence page loads Aura controls without reverting to old chat',()=>{
 const page=read('public/index.html');
 const app=read('public/app.js');
 const speech=read('public/ai-speech.js');
 assert.match(page,/ai-speech\.js\?v=aura-unified-01/);
 assert.match(app,/tf-master-welcome/);
 assert.match(app,/class="tf-master-orb" data-action="tfAiVoice"/);
 assert.match(app,/if\(el\.dataset\.action==='tfAiVoice'\)\{window\.TradeFlowVoice\?\.start\?\.\(\)/);
 assert.match(speech,/document\.querySelector\('\.tf-master,\.tf-ai-chat-box'\)/);
 assert.match(speech,/\.tf-master-message\.is-assistant/);
 assert.match(speech,/data-ai-wake-toggle/);
 assert.match(speech,/data-ai-speech-speaker/);
});

test('preview cache updates for unified voice and Cloudflare speech remains gated',()=>{
 const sw=read('public/sw.js');
 const worker=read('src/index.js');
 const aura=read('src/aura-tts.js');
 assert.match(sw,/aura-unified-01/);
 assert.match(worker,/\/api\/ai\/speech/);
 assert.match(aura,/env\.TF_AURA_TTS_ENABLED!=='true'/);
 assert.match(aura,/body\.code!==env\.TF_AI_PREVIEW_TOKEN/);
});
