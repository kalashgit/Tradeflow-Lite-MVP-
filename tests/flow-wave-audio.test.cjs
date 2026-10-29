const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const audio=require('../public/flow-wave-audio.js');
const flush=()=>new Promise(r=>setImmediate(r));
function fixture({denied=false,pending=false,reduced=false}={}){
 let sample=.008,frame,resolve,closed=0,stopped=0,connected=0,rafId=0;
 const listeners={},classes=new Set(),styles=[{},{},{},{}];
 const sheets=styles.map(style=>({style:{set transform(v){style.transform=v},removeProperty(k){delete style[k]}}}));
 let wave={classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)},querySelectorAll:()=>sheets};
 const doc={hidden:false,querySelector:()=>wave,addEventListener:(k,f)=>listeners[k]=f};
 const stream={getTracks:()=>[{stop:()=>stopped++,addEventListener:(k,f)=>listeners[k]=f}]};
 const analyser={fftSize:1024,frequencyBinCount:512,getFloatTimeDomainData:a=>a.fill(sample),getByteFrequencyData:a=>a.fill(sample>.01?150:0),disconnect(){}};
 class Context{constructor(){this.state='running';this.sampleRate=48000}resume(){return Promise.resolve()}close(){closed++;return Promise.resolve()}createAnalyser(){return analyser}createMediaStreamSource(){return {connect:()=>connected++,disconnect(){}}}}
 const env={AudioContext:Context,navigator:{mediaDevices:{getUserMedia:()=>denied?Promise.reject(Error('denied')):pending?new Promise(r=>resolve=r):Promise.resolve(stream)}},requestAnimationFrame:f=>{frame=f;return ++rafId},cancelAnimationFrame:()=>{frame=null},matchMedia:()=>({matches:reduced}),addEventListener:(k,f)=>listeners[k]=f};
 const meter=audio.createMeter({env,document:doc});
 return {meter,env,doc,classes,styles,listeners,stream,resolve:()=>resolve(stream),sample:v=>sample=v,tick:t=>{const f=frame;frame=null;f?.(t)},counts:()=>({closed,stopped,connected}),replace:()=>wave={...wave}};
}
test('real sample energy separates silence, quiet speech and loud speech without inventing audio',()=>{
 const bins=new Uint8Array(512).fill(100),samples=new Float32Array(1024);
 const level=value=>{samples.fill(value);return audio.measure(samples,bins,48000,1024).level};
 assert.equal(level(0),0);assert.equal(level(.005),0);assert.ok(level(.04)>0);assert.ok(level(.2)>level(.04));assert.equal(level(1),1);
 bins.fill(0);bins.fill(255,2,7);samples.fill(.1);
 const bands=audio.measure(samples,bins,48000,1024);assert.ok(bands.low>bands.high);assert.equal(bands.high,0);
});
test('envelope has fast attack, slower release and stable bounds independent of frame duration',()=>{
 const attack=audio.smooth(0,1,1/60),release=1-audio.smooth(1,0,1/60);
 assert.ok(attack>release);assert.ok(attack>0&&attack<1);assert.equal(audio.smooth(.5,1,0),.5);
 assert.ok(audio.smooth(0,1,100)<1);
});
test('microphone samples drive filled ribbon transforms and silence settles back',async()=>{
 const f=fixture();f.meter.start();await flush();assert.equal(f.counts().connected,1);
 f.tick(0);const silence=f.styles[3].transform;f.sample(.2);
 for(let t=16;t<500;t+=16)f.tick(t);
 const speech=f.styles[3].transform;assert.notEqual(speech,silence);assert.ok(f.classes.has('is-audio-reactive'));
 f.sample(0);for(let t=500;t<5000;t+=16)f.tick(t);
 assert.match(f.styles[3].transform,/scaleY\(1\.0000\)/);
 f.replace();f.tick(5016);assert.ok(f.classes.has('is-audio-reactive'),'repainted wave reconnects without reopening microphone');
 f.meter.stop();assert.deepEqual(f.counts(),{closed:1,stopped:1,connected:1});assert.ok(!f.classes.has('is-audio-reactive'));assert.equal(f.styles[0].transform,undefined);
 f.meter.stop();assert.equal(f.counts().stopped,1);
});
test('closing while permission is pending stops late tracks and cannot restart animation',async()=>{
 const f=fixture({pending:true});f.meter.start();f.meter.start();f.meter.stop();f.resolve();await flush();
 assert.deepEqual(f.counts(),{closed:1,stopped:1,connected:0});assert.equal(f.classes.size,0);
});
test('permission failure, unsupported metering and reduced motion are safe fallbacks',async()=>{
 const f=fixture({denied:true});f.meter.start();await flush();assert.equal(f.counts().closed,1);assert.equal(f.classes.size,0);
 const r=fixture({reduced:true});r.meter.start();await flush();assert.equal(r.counts().connected,0);
 const meter=audio.createMeter({env:{},document:{}});assert.doesNotThrow(()=>{meter.start();meter.stop()});
});
test('backgrounding and ended microphone tracks release audio resources',async()=>{
 for(const reason of ['visibilitychange','ended','pagehide']){
  const f=fixture();f.meter.start();await flush();if(reason==='visibilitychange')f.doc.hidden=true;
  f.listeners[reason]();assert.equal(f.counts().stopped,1);assert.equal(f.counts().closed,1);
 }
});
test('microphone lifecycle uses the same assistant and stops on Stop, recognition end, errors and close',async()=>{
 const voice=require('../public/voice-command.js'),previous=globalThis.TradeFlowFlowWaveAudio,engine=globalThis.SpeechRecognition;
 let started=0,stopped=0,active;
 globalThis.TradeFlowFlowWaveAudio={createMeter:()=>({start:()=>started++,stop:()=>stopped++})};
 globalThis.SpeechRecognition=class{constructor(){active=this}start(){}stop(){this.onend()}abort(){}};
 try{
  const events={},c=voice.createController({document:{addEventListener:(k,f)=>events[k]=f},repaint:async()=>{},snapshot:async()=>({}),now:()=>new Date()});
  const click=()=>events.click({target:{closest:selector=>selector==='[data-voice-workspace]'?null:{dataset:{voice:'mic'}}},preventDefault(){}});
  c.startListening();assert.equal(started,1);click();assert.ok(stopped>=1);
  c.startListening();active.onend();assert.equal(started,2);
  c.startListening();active.onerror({error:'not-allowed'});assert.match(c.view(),/Microphone permission denied/);
  c.startListening();const before=stopped;c.close();assert.equal(stopped,before+1);assert.equal(c.view(),'');
 }finally{globalThis.TradeFlowFlowWaveAudio=previous;if(engine===undefined)delete globalThis.SpeechRecognition;else globalThis.SpeechRecognition=engine}
});
test('meter loads before voice and is cached for offline use without changing DB schema',()=>{
 const html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
 assert.ok(html.indexOf('flow-wave-audio.js')<html.indexOf('voice-command.js'));
 assert.match(sw,/flow-wave-audio\.js\?v=flow-wave-v4/);assert.match(sw,/flow-wave-audio\\\.js/);
 assert.doesNotMatch(fs.readFileSync('public/flow-wave-audio.js','utf8'),/MediaRecorder|fetch\(|localStorage|indexedDB/);
});
