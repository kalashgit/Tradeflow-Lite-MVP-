'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=name=>fs.readFileSync(name,'utf8');
test('real TradeFlow page loads approved welcome layout and video adapter',()=>{
 const html=read('public/index.html');
 for(const asset of ['master-intelligence.css','master-intelligence-reference.css','master-intelligence-reference.js']){
  assert.ok(html.includes('./'+asset),asset+' missing from runtime index');
 }
});
test('TradeFlow AI route reuses existing Master Intelligence and conversation executor',()=>{
 const app=read('public/app.js');
 assert.match(app,/function tfAIView\(d\)\{\s*if\(!tfAIShowLegacySnapshot\)return tfAIMasterView\(d\)/);
 assert.match(app,/const chatting=tfAiConversationStarted\|\|tfChatMessages.length>0/);
 assert.match(app,/tfAiConversationStarted=true;\s*await tfAISend/);
 assert.match(app,/await tfAiSaveTurn\(\{role:'user'/);
});
test('mobile welcome cards, composer and reduced motion remain intact',()=>{
 const css=read('public/master-intelligence-reference.css');
 const base=read('public/master-intelligence.css');
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(base,/\.tf-master-conversation/);
});
test('video playback is isolated to welcome orb and cleaned up on navigation',()=>{
 const script=read('public/master-intelligence-reference.js');
 assert.match(script,/requestVideoFrameCallback/);
 assert.match(script,/video\.pause\(\)/);
 assert.match(script,/MutationObserver\(sync\)/);
 assert.match(script,/dataset\.meshState='fallback'/);
});