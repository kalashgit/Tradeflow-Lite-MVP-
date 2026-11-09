'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/master-intelligence.css','utf8');

test('Intelligence route uses the clean welcome/chat surface',()=>{
 assert.match(source,/function tfAIView\(d\)\{\s*if\(!tfAIShowLegacySnapshot\)return tfAIMasterView\(d\)/);
 assert.match(source,/const chatting=tfAiConversationStarted/);
 assert.match(source,/chatting\?'<div class="tf-master-conversation"/);
 assert.match(source,/:'<div class="tf-master-welcome"/);
 assert.match(source,/Master Intelligence<\/h1>/);
 assert.match(source,/id="tfAiChatForm" class="tf-master-compose"/);
});

test('Send transitions to conversation using existing message path',()=>{
 assert.match(source,/if\(e\.target\.id==='tfAiChatForm'\)[\s\S]*?tfAiConversationStarted=true;\s*await tfAISend/);
 assert.match(source,/async function tfAISend\(text,\{speakReply=false,modality='text'\}=\{\}\)/);
 assert.match(source,/await tfAiSaveTurn\(\{role:'user'/);
 assert.match(source,/tfAiConversationStarted=true;[\s\S]*?tfAiUpdateChatUI\(\)/);
});

test('Saved history and safe preview controls remain available',()=>{
 for(const action of ['tfAiHistoryToggle','tfAiNewThread','tfAiExportThread','tfAiClear','tfAiUnlockForm'])assert.ok(source.includes(action),action);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(max-width:650px\)/);
});
