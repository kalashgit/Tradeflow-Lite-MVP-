const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

function setup(fetch){
 let lastAudio,revoked=[];
 class Audio{
  constructor(url){this.url=url;lastAudio=this;this.paused=false}
  play(){return Promise.resolve()}
  pause(){this.paused=true}
  removeAttribute(){}
  load(){}
 }
 const listeners={};const window={addEventListener(name,fn){listeners[name]=fn}};
 const document={addEventListener(name,fn){listeners[name]=fn},hidden:false};
 vm.runInNewContext(readFileSync(require.resolve('../public/ai-speech.js'),'utf8'),{window,document,fetch,Audio,AbortController,URL:{createObjectURL:()=> 'blob:audio',revokeObjectURL:url=>revoked.push(url)},MutationObserver:class{}});
 return {api:window.TradeFlowSpeech,listeners,document,get audio(){return lastAudio},revoked};
}

test('speech is opt-in and begins only on explicit call',async()=>{
 let calls=0;const t=setup(async()=>{calls++;return new Response(new Blob(['audio']),{headers:{'Content-Type':'audio/mpeg'}})});
 assert.equal(t.api.auto,false);assert.equal(calls,0);
 assert.equal(await t.api.speak('Hello','private-code'),true);
 assert.equal(calls,1);assert.equal(t.api.state,'speaking');
 t.api.stop();assert.equal(t.audio.paused,true);assert.deepEqual(t.revoked,['blob:audio']);
});
test('page hide stops active playback and blocks stale audio',async()=>{
 let resolveFetch;const t=setup(()=>new Promise(resolve=>resolveFetch=resolve));
 const pending=t.api.speak('First','private-code');
 t.document.hidden=true;t.listeners.visibilitychange();
 resolveFetch(new Response(new Blob(['audio']),{headers:{'Content-Type':'audio/mpeg'}}));
 assert.equal(await pending,false);assert.equal(t.api.state,'idle');assert.equal(t.audio,undefined);
});
test('synthesis failure never claims active playback',async()=>{
 const t=setup(async()=>new Response('disabled',{status:503}));
 assert.equal(await t.api.speak('Hello','private-code'),false);
 assert.equal(t.api.state,'unavailable');
});
