/* Local microphone metering only. Never connects to speakers, records, or uploads audio. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowFlowWaveAudio=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const clamp=n=>Math.max(0,Math.min(1,n));
function measure(samples,bins,sampleRate,fftSize){
 let sum=0;for(const sample of samples)sum+=sample*sample;
 const rms=Math.sqrt(sum/Math.max(1,samples.length));
 // Noise gate and logarithmic gain keep quiet speech useful without magnifying silence.
 const level=clamp(Math.log1p(Math.max(0,rms-.008)*35)/Math.log(8));
 const band=(lo,hi)=>{let total=0,count=0;for(let i=Math.ceil(lo*fftSize/sampleRate);i<Math.min(bins.length,Math.ceil(hi*fftSize/sampleRate));i++){total+=bins[i]/255;count++}return count?total/count:0};
 return {level,low:band(85,350),mid:band(350,1800),high:band(1800,4000)};
}
function smooth(previous,next,seconds){
 const tau=next > previous ? .055 : .22;
 return previous+(next-previous)*(1-Math.exp(-Math.min(.1,Math.max(0,seconds))/tau));
}
function createMeter(options={}){
 const env=options.env||globalThis,doc=options.document||env.document;
 let generation=0,session=null,pending=false,painted=null;
 const raf=fn=>env.requestAnimationFrame(fn),cancel=id=>env.cancelAnimationFrame?.(id);
 function clearPaint(){if(painted){painted.classList.remove('is-audio-reactive');for(const el of painted.querySelectorAll('.tf-flow-sheet'))el.style.removeProperty('transform');painted=null}}
 function release(s){
  if(!s)return;cancel(s.frame);s.source?.disconnect();s.analyser?.disconnect();
  for(const track of s.stream?.getTracks()||[])track.stop();
  try{const closing=s.context?.close();closing?.catch?.(()=>{})}catch{}
 }
 function stop(){generation++;pending=false;const old=session;session=null;release(old);clearPaint()}
 function frame(s,time){
  if(session!==s)return;
  if(doc?.hidden){stop();return}
  try{
   if(s.context.state!=='running'){clearPaint();s.frame=raf(t=>frame(s,t));return}
   s.analyser.getFloatTimeDomainData(s.samples);s.analyser.getByteFrequencyData(s.bins);
   const values=measure(s.samples,s.bins,s.context.sampleRate,s.analyser.fftSize),dt=s.time===null?1/60:(time-s.time)/1000;s.time=time;
   for(const key of ['level','low','mid','high'])s.energy[key]=smooth(s.energy[key],values[key],dt);
   s.phase+=Math.min(.05,dt)*s.energy.level*3.2;
   const wave=doc?.querySelector?.('.tf-voice-wave.is-listening');
   if(wave!==painted){clearPaint();painted=wave}
   const reduce=env.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   if(wave&&reduce){clearPaint()}
   else if(wave){
    wave.classList.add('is-audio-reactive');
    const bands=[s.energy.low,s.energy.mid,s.energy.high,s.energy.mid];
    wave.querySelectorAll('.tf-flow-sheet').forEach((el,i)=>{
     const strength=s.energy.level*(.7+.3*bands[i]);
     // The existing broad surfaces breathe and drift independently, driven by measured speech.
     // Silence settles to the reference silhouette; rapid audio cycles never become jittery traces.
     const y=Math.sin(s.phase+i*1.7)*strength*9,x=Math.cos(s.phase*.65+i)*strength*3;
     el.style.transform='translate('+x.toFixed(3)+'px,'+y.toFixed(3)+'px) scaleY('+(1+strength*(i===3?.36:.48)).toFixed(4)+')';
    });
   }
   s.frame=raf(t=>frame(s,t));
  }catch{stop()}
 }
 function start(){
  if(session||pending)return;
  const Audio=env.AudioContext||env.webkitAudioContext;
  if(!Audio||!env.navigator?.mediaDevices?.getUserMedia||!env.requestAnimationFrame||doc?.hidden||env.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const token=++generation;pending=true;const s={time:null,phase:0,energy:{level:0,low:0,mid:0,high:0}};
  try{
   // Resume synchronously from the microphone tap to retain mobile browser user activation.
   s.context=new Audio();session=s;
   const resumed=s.context.resume();resumed?.catch?.(()=>{if(session===s)stop()});
   Promise.resolve(env.navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})).then(stream=>{
    if(token!==generation||session!==s){for(const track of stream.getTracks())track.stop();return}
    s.stream=stream;pending=false;
    for(const track of stream.getTracks())track.addEventListener?.('ended',()=>{if(session===s)stop()},{once:true});
    s.analyser=s.context.createAnalyser();s.analyser.fftSize=1024;s.analyser.smoothingTimeConstant=.25;
    s.samples=new Float32Array(s.analyser.fftSize);s.bins=new Uint8Array(s.analyser.frequencyBinCount);
    s.source=s.context.createMediaStreamSource(stream);s.source.connect(s.analyser);
    s.frame=raf(t=>frame(s,t));
   }).catch(()=>{if(session===s)stop()});
  }catch{if(session===s)stop();else{pending=false;release(s)}}
 }
 doc?.addEventListener?.('visibilitychange',()=>{if(doc.hidden)stop()});
 env.addEventListener?.('pagehide',stop);
 return Object.freeze({start,stop});
}
return Object.freeze({createMeter,measure,smooth});
});
