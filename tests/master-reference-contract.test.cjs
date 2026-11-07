'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/master-intelligence.css','utf8');
const speech=fs.readFileSync('public/ai-speech.js','utf8');

test('reference view shares the real brand logo and animated mesh between welcome and conversation',()=>{
 assert.match(app,/const mark='<img class="tf-master-mark" src="\.\/brand\/tradeflow-mark\.svg"/);
 assert.match(app,/class="tf-master-orb-mesh" src="\.\/orb-concept-b\/reference\.gif"/);
 assert.match(app,/tf-master-conversation/);
 assert.match(css,/\.tf-master-starters\{display:grid;grid-template-columns:repeat\(4/);
});

test('raw model Markdown is cleaned for visible chat text without modifying stored turns',()=>{
 assert.match(app,/function tfAiReferencePlainText\(value\)/);
 assert.match(app,/esc\(tfAiReferencePlainText\(m\.content\)\)/);
 assert.match(app,/function tfAiReferenceTime\(message\)/);
 assert.match(app,/tfAiSaveTurn\(turn\)/);
 assert.doesNotMatch(app,/const messages=tfChatMessages\.map\([^\n]*tfAiAttribution\(m\)/);
});

test('header, composer and voice match founder reference without individual Listen buttons',()=>{
 assert.match(app,/aria-label="Conversation history">[^\n]*<svg/);
 assert.match(app,/aria-label="Talk to TradeFlow">[^\n]*<svg/);
 assert.match(app,/aria-label="Send message">[^\n]*<svg/);
 assert.match(speech,/bubble\.querySelectorAll\('\[data-ai-speech-play\]'\)\.forEach\(button=>button\.remove\(\)\)/);
 assert.doesNotMatch(speech,/button\.textContent='▶ Listen'/);
 assert.match(css,/\.tf-master-message\.is-user \.tf-master-message-body\{background:linear-gradient/);
});

test('voice Settings and trust context remain available outside the conversation layout',()=>{
 assert.match(app,/data-action="tfAiOpenVoiceSettings"/);
 assert.match(app,/AI answers are suggestions, not independently verified business records/);
 assert.match(speech,/data-ai-speech-speaker/);
});
