'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createPlayback}=require('../public/speech-playback.js');
class FakeAudio {
 constructor(){this.sampleRate=24000;this.destination={};FakeAudio.all.push(this)}
 resume(){return Promise.resolve()}
 close(){this.closed=true;return Promise.resolve()}
 decodeAudioData(){return Promise.resolve({})}
 createBufferSource(){const source={connect(){},disconnect(){},start:()=>{this.started=true},stop:()=>{this.stopped=true}};return source}
 createAnalyser(){return {fftSize:1024,frequencyBinCount:512,connect(){},disconnect(){},getFloatTimeDomainData(a){a.fill(.2)},getByteFrequencyData(a){a.fill(25)}}}
}FakeAudio.all=[];
function harness(fetchImpl){let ctx={actorId:'local-owner',businessId:'local-business',threadId:'thread_one',screen:'ai'};const turn={id:'turn_one',threadId:ctx.threadId,role:'assistant',status:'committed',content:'Actual saved answer'};
 const ticket={version:1,ticket:'a'.repeat(43),threadId:ctx.threadId,turnId:turn.id,textSha256:crypto.createHash('sha256').update(turn.content).digest('hex'),expiresAt:Date.now()+60000};
 const states=[],features=[];const p=createPlayback({readContext:()=>ctx,readTurn:id=>id===turn.id?turn:null,getCode:()=>'',AudioContextImpl:FakeAudio,fetchImpl,emit:s=>states.push(s),onFeatures:f=>features.push(f)});assert.equal(p.register(turn,ticket),true);
 return {p,turn,ticket,states,features,setContext:value=>{ctx={...ctx,...value}}};
}
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,2))}throw Error('Expected operation did not begin')}
const response=ticket=>({ok:true,headers:new Headers({'Content-Type':'audio/wav','X-TradeFlow-Text-SHA256':ticket.textSha256}),arrayBuffer:async()=>new ArrayBuffer(50)});
test('real playback lifecycle prepares, decodes, speaks, emits only measured features and stops resources',async()=>{
 let h;h=harness(async()=>response(h.ticket));await h.p.speak(h.turn.id);assert.equal(h.p.getState().status,'speaking');await new Promise(r=>setTimeout(r,65));assert.ok(h.features.some(f=>f.active&&f.rms>0));h.p.stop();assert.equal(FakeAudio.all.at(-1).closed,true);assert.equal(h.features.at(-1).active,false);h.p.dispose();
});
test('changed actor, business, thread or navigation invalidates queued speech',async()=>{
 for(const patch of [{actorId:'other'},{businessId:'other'},{threadId:'other'},{screen:'jobs'}]){
  let resolve;const h=harness(()=>new Promise(r=>resolve=r));const pending=h.p.speak(h.turn.id);await until(()=>resolve);h.setContext(patch);h.p.contextChanged();resolve(response(h.ticket));await pending;assert.equal(h.p.getState().status,'idle');assert.equal(FakeAudio.all.at(-1).started,undefined);h.p.dispose();
 }
});
test('late old audio cannot play, relabel or cancel a newer generation',async()=>{
 const requests=[];const h=harness(()=>new Promise(r=>requests.push(r)));const old=h.p.speak(h.turn.id);await until(()=>requests.length===1);const next=h.p.speak(h.turn.id);await until(()=>requests.length===2);requests[0](response(h.ticket));await old;assert.equal(h.p.getState().status,'preparing');requests[1](response(h.ticket));await next;assert.equal(h.p.getState().status,'speaking');assert.equal(FakeAudio.all.at(-2).started,undefined);h.p.dispose();
});
test('modified saved text, wrong audio hash and provider failure never produce speaking or success',async()=>{
 for(const failure of ['text','hash','provider']){
  let calls=0;const h=harness(async()=>{calls++;return failure==='provider'?{ok:false,json:async()=>({error:'Model missing'})}:response({...h.ticket,textSha256:'0'.repeat(64)})});if(failure==='text')h.turn.content='Changed answer';await h.p.speak(h.turn.id);assert.equal(h.p.getState().status,'unavailable');if(failure==='text')assert.equal(calls,0);h.p.dispose();
 }
});
