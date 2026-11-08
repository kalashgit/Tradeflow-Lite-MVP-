const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const voice=require('../public/voice-command.js');

function fixture(sendConversation){
 const events={};
 const controller=voice.createController({document:{addEventListener:(type,handler)=>(events[type]??=[]).push(handler)},repaint:async()=>{},sendConversation});
 const click=action=>events.click[0]({target:{closest:selector=>selector==='[data-voice-workspace]'?null:{dataset:{voice:action}}},preventDefault(){}});
 const form=text=>events.submit[0]({target:{id:'tfVoiceForm',querySelector:()=>({value:text})},preventDefault(){}});
 return {controller,click,form};
}
test('orb interaction is nonmodal, compact, accessible and preserves same send callback',async()=>{
 const sent=[];const f=fixture(async text=>sent.push(text));f.controller.start();
 const html=f.controller.view();
 assert.match(html,/tf-orb-bubble/);assert.match(html,/aria-live="polite"/);
 assert.doesNotMatch(html,/tf-voice-overlay|aria-modal="true"|What would you like to do/);
 f.form('one message');await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(sent,['one message']);f.controller.close();assert.equal(f.controller.view(),'');
});
test('unsupported recognition retains keyboard fallback and honest capability label',()=>{
 const old=globalThis.SpeechRecognition,webkit=globalThis.webkitSpeechRecognition;
 delete globalThis.SpeechRecognition;delete globalThis.webkitSpeechRecognition;
 try{const f=fixture();f.controller.startListening();assert.match(f.controller.view(),/Speech recognition is unavailable|Speech unavailable/);assert.equal(f.controller.state().listening,false)}
 finally{if(old!==undefined)globalThis.SpeechRecognition=old;if(webkit!==undefined)globalThis.webkitSpeechRecognition=webkit}
});
test('bubble stays adjacent to orb with mobile safe areas, reduced motion and original membrane',()=>{
 const css=fs.readFileSync('public/voice-command.css','utf8');const orb=fs.readFileSync('public/intelligence-orb-idle.css','utf8');
 assert.match(css,/\.tf-orb-bubble\{position:fixed/);assert.match(css,/env\(safe-area-inset-right\)/);assert.match(css,/@media\(max-width:430px\)/);assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(orb,/tf-orb-is-active/);assert.match(orb,/\.tf-orb-concept-b-canvas/);
});
