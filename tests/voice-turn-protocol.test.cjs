'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createVoiceTurnMachine}=require('../src/voice-turn-protocol.cjs');
function make(){
 const session=createVoiceTurnMachine({sessionId:'synthetic_voice_01',threadId:'synthetic_thread_01'});
 let n=0;
 return {session,event(kind,payload={}){return session.dispatch({version:1,session_id:'synthetic_voice_01',thread_id:'synthetic_thread_01',event_id:'evt_'+String(++n).padStart(4,'0'),sequence:n,kind,payload})}};
}
function throughReasoning(t){
 t.event('voice.session.request');t.event('voice.permission.granted');t.event('vad.speech_start');
 t.event('asr.partial',{text:'What are'});
 t.event('vad.speech_end');
 return t.event('asr.final',{text:'What are my priorities?'});
}
test('explicit microphone permission required; no ambient capture',()=>{
 const t=make();assert.equal(t.session.snapshot().state,'idle');
 assert.throws(()=>t.event('voice.permission.granted'));
 const r=t.event('voice.session.request');assert.deepEqual(r.effects,[{kind:'mic.request_permission'}]);
 assert.equal(t.event('voice.permission.granted').snapshot.state,'listening');
});
test('partial ASR is provisional; only a final transcript produces a user turn',()=>{
 const t=make();
 t.event('voice.session.request');t.event('voice.permission.granted');t.event('vad.speech_start');
 assert.equal(t.event('asr.partial',{text:'Unverified number 123'}).effects[0].kind,'caption.provisional');
 assert.equal(t.session.snapshot().lastUserFinal,'');
 t.event('vad.speech_end');
 const r=t.event('asr.final',{text:'Check the job status'});
 assert.equal(r.effects[0].kind,'conversation.user_turn.final');assert.equal(r.effects[0].modality,'voice');
 assert.equal(r.snapshot.partial,'');
});
test('unvalidated assistant text cannot enter speech or durable turn',()=>{
 const t=make();throughReasoning(t);
 assert.throws(()=>t.event('assistant.text.final',{text:'Invented numbers',validated:false}));
 assert.throws(()=>t.event('tts.audio.start'));
 assert.equal(t.session.snapshot().state,'reasoning');
 const accepted=t.event('assistant.text.final',{text:'Evidence missing.',validated:true});
 assert.equal(accepted.effects[0].executionAuthority,false);
 assert.equal(t.event('tts.audio.start').snapshot.state,'speaking');
});
test('barge-in cancels old audio generation and permits a new utterance',()=>{
 const t=make();throughReasoning(t);t.event('assistant.text.final',{validated:true,text:'First answer'});t.event('tts.audio.start');
 const old=t.session.snapshot().generation;
 const out=t.event('voice.interrupt');
 assert.equal(out.snapshot.state,'capturing');assert.ok(out.snapshot.generation>old);
 assert.ok(out.effects.some(e=>e.kind==='audio.playback.cancel_prior_generation'));
 assert.equal(out.snapshot.lastAssistantText,'');
 assert.equal(t.event('tts.audio.chunk',{generation:old}).status,'stale_audio_ignored');
 assert.equal(t.event('asr.partial',{text:'Wait!'}).snapshot.partial,'Wait!');
 t.event('vad.speech_end');
 assert.equal(t.event('asr.final',{text:'New question'}).snapshot.state,'reasoning');
});
test('validated playback returns to listening only on matching generation',()=>{
 const t=make();throughReasoning(t);t.event('assistant.text.final',{validated:true,text:'Here is the result.'});t.event('tts.audio.start');
 assert.equal(t.event('tts.audio.chunk',{generation:0}).effects[0].kind,'audio.playback.accept_chunk');
 assert.throws(()=>t.event('tts.audio.final',{generation:1}));
 assert.equal(t.event('tts.audio.final',{generation:0}).snapshot.state,'listening');
});
test('duplicate events are idempotent and old sequences rejected',()=>{
 const t=make(),a={version:1,session_id:'synthetic_voice_01',thread_id:'synthetic_thread_01',event_id:'evt_dup_01',sequence:4,kind:'voice.session.request',payload:{}};
 assert.equal(t.session.dispatch(a).status,'accepted');
 assert.equal(t.session.dispatch(a).status,'duplicate');
 assert.throws(()=>t.session.dispatch({...a,payload:{tampered:true}}),/Conflicting duplicate/);
 assert.throws(()=>t.session.dispatch({...a,event_id:'evt_older',sequence:3}));
});
test('permission denied fails closed and any end releases capture',()=>{
 const denied=make();denied.event('voice.session.request');
 const r=denied.event('voice.permission.denied');
 assert.equal(r.snapshot.state,'failed');assert.ok(r.effects.some(e=>e.kind==='mic.release'));
 const t=make();t.event('voice.session.request');t.event('voice.permission.granted');
 const stop=t.event('voice.session.end');assert.equal(stop.snapshot.state,'idle');
 assert.ok(stop.effects.some(e=>e.kind==='mic.release'));
});
test('foreign session/invalid event rejected and model never receives business execution authority',()=>{
 const t=make();assert.throws(()=>t.session.dispatch({version:1,session_id:'other',thread_id:'synthetic_thread_01',event_id:'evt_0001',sequence:1,kind:'voice.session.request'}));
 assert.throws(()=>t.session.dispatch({version:1,session_id:'synthetic_voice_01',thread_id:'synthetic_thread_01',event_id:'evt_0001',sequence:1,kind:'business.execute'}));
 assert.equal(t.session.snapshot().state,'idle');
});
