'use strict';const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const a=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
test('each assistant message supports copy feedback TTS and share',()=>{
 assert.match(a,/function tfAiMessageActions\(m\)/);
 for(const k of ['copy','feedback','listen','share'])assert.ok(a.includes(k+':'),k);
 assert.match(a,/tfAiReferenceTime\(m\)\+tfAiMessageActions\(m\)/);
 assert.match(a,/tfAiAttribution\(m\)\+tfAiMessageActions\(m\)/);
 assert.match(a,/navigator\.share/);assert.match(a,/SpeechSynthesisUtterance/);
 assert.match(a,/navigator\.clipboard\?\.writeText/);
 assert.match(a,/tfChatMessages\.find\(x=>x\.id===b\.dataset\.id&&x\.role==='assistant'\)/);
});
