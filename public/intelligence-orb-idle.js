/* Concept B: reference-derived 2.5D membrane. Bidirectional optical-flow
 * transport preserves the founder's woven strands, folds and T. Lighting is
 * baked from the reference, not claimed to be reconstructed 3D illumination.
 * Only measured assistant playback features raise speech energy. */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root){root.TradeFlowConceptBOrb=api;root.TradeFlowOrbIdle=api;}
 if(root?.document){const start=()=>api.attach({root,document:root.document});
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const version='concept-b-v5',clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),finite=x=>Number.isFinite(x)?x:0;
 function frameAt(seconds){const phase=((finite(seconds)/.17)%9+9)%9;return {index:Math.floor(phase),blend:phase-Math.floor(phase)};}
 function normalizeSpeech(d){
  if(!d||d.version!==1||d.source!=='assistant_playback')return null;
  if(d.active!==true)return {active:false,level:0};
  return {active:true,level:clamp(.18+4.4*clamp(finite(d.rms),0,1)+.32*clamp(finite(d.peak),0,1),.18,1)};
 }
 const fallbackVertex=`attribute vec2 position; varying vec2 uv;
 void main(){uv=vec2(position.x*.5+.5,.5-position.y*.5);gl_Position=vec4(position,0.,1.);}`;
 const fallbackFragment=`precision highp float;
 varying vec2 uv;uniform sampler2D artwork,forwardFlow,backwardFlow;
 uniform float frameIndex,blend,energy,motionEnergy,clockTime,referenceLight;
 vec2 tile(float i){return vec2(mod(i,3.),floor(i/3.));}
 vec2 atlas(vec2 p,float i){return (tile(i)+clamp(p,vec2(.5/420.,.5/408.),vec2(419.5/420.,407.5/408.)))/3.;}
 vec2 flow(sampler2D map,vec2 p,float i){return (texture2D(map,atlas(p,i)).rg*255.-128.)/127.*96./vec2(420.,408.);}
 void main(){
  float next=mod(frameIndex+1.,9.);
  vec2 p=uv,delta=p-.5;float r=length(delta);
  // A shared smooth displacement of the membrane, locked around the T.
  float lock=smoothstep(.15,.25,r);
  p+=motionEnergy*.001*lock*vec2(sin(12.*p.y+clockTime*.9),sin(11.*p.x-clockTime*.73));
  vec2 a=p,b=p;
  // Invert the forward/backward transport rather than dissolve stationary frames.
  for(int k=0;k<3;k++){
   a=mix(a,p-blend*flow(forwardFlow,a,frameIndex),.8);
   b=mix(b,p-(1.-blend)*flow(backwardFlow,b,frameIndex),.8);
  }
  vec3 ca=texture2D(artwork,atlas(a,frameIndex)).rgb;
  vec3 cb=texture2D(artwork,atlas(b,next)).rgb;
  vec3 rgb=mix(ca,cb,blend);
  float gain=mix(.48+energy*.82,1.,referenceLight);
  rgb*=gain;
  float blueMix=energy*(1.-referenceLight)*smoothstep(.15,.24,length(uv-.5));
  rgb*=mix(vec3(1.),vec3(.7,.68,1.18),blueMix);
  // Reference light is premultiplied over black; preserve the soft scattering
  // while shielding the deep navy interior from content behind the orb.
  float alpha=max((1.-smoothstep(.28,.48,r))*.96,clamp(max(rgb.g,rgb.b)*3.,0.,1.));
  gl_FragColor=vec4(rgb,alpha);
 }`;
 const flowHelpers=`
 vec2 tile(float i){return vec2(mod(i,3.),floor(i/3.));}
 vec2 atlas(vec2 p,float i){return (tile(i)+clamp(p,vec2(.5/420.,.5/408.),vec2(419.5/420.,407.5/408.)))/3.;}
 vec2 flow(sampler2D map,vec2 p,float i){return (texture2D(map,atlas(p,i)).rg*255.-128.)/127.*96./vec2(420.,408.);}`;
 const meshVertex=`precision highp float;attribute vec2 position;
 uniform sampler2D forwardFlow,backwardFlow;
 uniform float frameIndex,blend,energy,motionEnergy,clockTime;
 varying vec2 uv,fromUV,toUV;
 ${flowHelpers}
 void main(){
  uv=vec2(position.x*.5+.5,.5-position.y*.5);vec2 p=uv;
  float lock=smoothstep(.15,.25,length(p-.5));
  p+=motionEnergy*.001*lock*vec2(sin(12.*p.y+clockTime*.9),sin(11.*p.x-clockTime*.73));
  vec2 a=p,b=p;
  for(int k=0;k<3;k++){
   a=mix(a,p-blend*flow(forwardFlow,a,frameIndex),.8);
   b=mix(b,p-(1.-blend)*flow(backwardFlow,b,frameIndex),.8);
  }
  fromUV=a;toUV=b;gl_Position=vec4(position,0.,1.);
 }`;
 const meshFragment=`precision highp float;
 varying vec2 uv,fromUV,toUV;uniform sampler2D artwork;
 uniform float frameIndex,blend,energy,referenceLight;
 ${flowHelpers}
 void main(){
  vec3 rgb=mix(texture2D(artwork,atlas(fromUV,frameIndex)).rgb,texture2D(artwork,atlas(toUV,mod(frameIndex+1.,9.))).rgb,blend);
  rgb*=mix(.48+energy*.82,1.,referenceLight);
  float blueMix=energy*(1.-referenceLight)*smoothstep(.15,.24,length(uv-.5));
  rgb*=mix(vec3(1.),vec3(.7,.68,1.18),blueMix);
  float alpha=max((1.-smoothstep(.28,.48,length(uv-.5)))*.96,clamp(max(rgb.g,rgb.b)*3.,0.,1.));
  gl_FragColor=vec4(rgb,alpha);
 }`;
 function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
 if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const reason=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(reason);}return s;}
 function createRenderer(canvas,{root,document,button}={}){
  let gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
  const supportsVertexFlow=!!gl&&gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)>=2;
  let ctx=null,program=null,buffer=null,indexBuffer=null,meshTransport=false,indexCount=0,textures=[],uniforms={},disposed=false,ready=false,raf=0;
  let time=0,last=null,lastPaint=null,frames=0,activity=0,speechPresence=0,speaking=false,level=0,speechAt=-Infinity;
  let interval=0,slow=0,loadError=null,contextLost=false,fallbackActive=false;
  const costs=[],intervals=[],reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)');let previousReduced=!!reduced?.matches;
  const script=document.querySelector('script[src*="intelligence-orb-idle.js"]');
  const base=new URL('orb-concept-b/',script?.src||document.baseURI);
  const images=['membrane.png','forward.png','backward.png'].map(name=>{const im=new root.Image();im.src=new URL(name,base).href;return im;});
  function initGL(){
   const rect=canvas.getBoundingClientRect();
   meshTransport=supportsVertexFlow&&Math.max(rect.width,rect.height)*clamp(root.devicePixelRatio||1,1,2)>256;
   const vs=shader(gl,gl.VERTEX_SHADER,meshTransport?meshVertex:fallbackVertex),fs=shader(gl,gl.FRAGMENT_SHADER,meshTransport?meshFragment:fallbackFragment);
   program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
   gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   if(meshTransport){
    // 48×48 shared transport cells: the weave is baked at native resolution;
    // smooth fold displacement is evaluated once per shared grid vertex.
    const n=48,vertices=[],indices=[];
    for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)vertices.push(x/n*2-1,y/n*2-1);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x,b=a+1,c=a+n+1,d=c+1;indices.push(a,b,c,b,d,c);}
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);indexCount=indices.length;
   }else gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
   const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   for(const name of ['frameIndex','blend','energy','motionEnergy','clockTime','referenceLight'])uniforms[name]=gl.getUniformLocation(program,name);
   textures=images.map((im,i)=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,im);gl.uniform1i(gl.getUniformLocation(program,['artwork','forwardFlow','backwardFlow'][i]),i);return texture;});
  }
  if(!gl)ctx=canvas.getContext('2d',{alpha:true});
  function renderAt(seconds=time,energy=activity,reference=false){
   if(disposed||!ready||contextLost)return;
   const start=root.performance.now(),b=canvas.getBoundingClientRect(),dpr=clamp(root.devicePixelRatio||1,1,2);
   const w=clamp(Math.round(b.width*dpr),2,840),h=clamp(Math.round(b.height*dpr),2,816);
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   const {index:i,blend:mix}=frameAt(seconds);
   energy=clamp(finite(energy),0,1);
   if(gl){
    const meshNeeded=supportsVertexFlow&&Math.max(w,h)>256;
    if(meshNeeded!==meshTransport){textures.forEach(t=>gl.deleteTexture(t));gl.deleteBuffer(buffer);if(indexBuffer)gl.deleteBuffer(indexBuffer);gl.deleteProgram(program);indexBuffer=null;initGL();}
    gl.viewport(0,0,w,h);gl.uniform1f(uniforms.frameIndex,i);gl.uniform1f(uniforms.blend,mix);gl.uniform1f(uniforms.energy,energy);gl.uniform1f(uniforms.motionEnergy,reduced?.matches?0:energy);
    gl.uniform1f(uniforms.clockTime,seconds);gl.uniform1f(uniforms.referenceLight,reference?1:0);if(meshTransport)gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);else gl.drawArrays(gl.TRIANGLES,0,6);
   }else if(ctx){
    // Measured fallback: continuous crossfade, same artwork/identity; no flow warp.
    ctx.clearRect(0,0,w,h);ctx.globalAlpha=1;ctx.drawImage(images[0],(i%3)*420,Math.floor(i/3)*408,420,408,0,0,w,h);
    const j=(i+1)%9;ctx.globalAlpha=mix;ctx.drawImage(images[0],(j%3)*420,Math.floor(j/3)*408,420,408,0,0,w,h);ctx.globalAlpha=1;
    if(!reference){
     const pixels=ctx.getImageData(0,0,w,h),data=pixels.data,gain=.48+energy*.82;
     for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const r=Math.hypot((x+.5)/w-.5,(y+.5)/h-.5),v=clamp((r-.15)/.09,0,1),blue=energy*v*v*(3-2*v),p=(y*w+x)*4;
      data[p]*=gain*(1-.3*blue);data[p+1]*=gain*(1-.32*blue);data[p+2]*=gain*(1+.18*blue);
     }
     ctx.putImageData(pixels,0,0);
    }
   }
   if(button){button.dataset.orbState=energy>.12?'speaking':'idle';button.dataset.orbBackend=gl?'webgl-flow':'canvas-crossfade';}
   costs.push(root.performance.now()-start);if(costs.length>300)costs.shift();frames++;
  }
  function tick(now){
   raf=0;if(disposed||document.hidden||!canvas.isConnected||contextLost)return;
   const elapsed=last===null?0:Math.max(0,(now-last)/1000),dt=Math.min(elapsed,.1),oldActivity=activity,motionReduced=!!reduced?.matches;last=now;
   if(now-speechAt>600){speaking=false;level=0;}
   activity+=( (speaking?level:0)-activity)*(1-Math.exp(-dt*(speaking?7:3)));
   speechPresence+=((speaking?1:0)-speechPresence)*(1-Math.exp(-dt*(speaking?7:3)));
   if(!reduced?.matches)time+=elapsed*(1-.82*speechPresence);
   const shouldPaint=!motionReduced||motionReduced!==previousReduced||Math.abs(activity-oldActivity)>.001;previousReduced=motionReduced;
   if(shouldPaint&&(lastPaint===null||now-lastPaint>=interval)){
    if(lastPaint!==null){intervals.push(now-lastPaint);if(intervals.length>300)intervals.shift();}
    renderAt(reduced?.matches?0:time,activity);lastPaint=now;
    // Sustained missed refreshes select 30Hz. Resolution is bounded above.
    if(!reduced?.matches&&dt>.024)slow++;else slow=Math.max(0,slow-1);
    if(slow>30)interval=32;
   }
   raf=root.requestAnimationFrame(tick);
  }
  function resume(){if(raf)root.cancelAnimationFrame(raf);raf=0;last=null;lastPaint=null;
   if(ready&&!disposed&&!document.hidden&&!contextLost){renderAt(reduced?.matches?0:time,activity);raf=root.requestAnimationFrame(tick);}}
  function speech(e){const value=normalizeSpeech(e.detail);if(!value)return;speechAt=root.performance.now();speaking=value.active;level=value.level;if(!raf)resume();}
  function voice(e){if(['idle','unavailable','error'].includes(e.detail?.status)){speaking=false;level=0;if(!raf)resume();}}
  function visibility(){if(document.hidden){if(raf)root.cancelAnimationFrame(raf);raf=0;last=null;speaking=false;level=0;activity=0;speechPresence=0;}else resume();}
  function lost(e){e.preventDefault();contextLost=true;fallbackActive=true;if(button)button.dataset.orbBackend="animated-reference";if(raf)root.cancelAnimationFrame(raf);raf=0;}
  function restored(){try{initGL();contextLost=false;fallbackActive=false;resume();}catch(e){loadError=String(e);fallbackActive=true;if(button)button.dataset.orbBackend='animated-reference';}}
  root.addEventListener('tradeflow:speech-features',speech);root.addEventListener('tradeflow:voice-state',voice);
  document.addEventListener('visibilitychange',visibility);reduced?.addEventListener?.('change',resume);root.addEventListener('pageshow',resume);
  canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
  const resize=new root.ResizeObserver(resume);resize.observe(canvas);
  Promise.all(images.map(im=>im.decode())).then(()=>{if(disposed)return;if(gl)initGL();ready=true;resume();}).catch(e=>{loadError=String(e);fallbackActive=true;if(button)button.dataset.orbBackend='animated-reference';});
  return Object.freeze({isAttached:()=>canvas.isConnected&&canvas.parentNode===button,renderAt,resetStats(){costs.length=0;intervals.length=0;frames=0;lastPaint=null;},stats:()=>({frames,time,activity,speechPresence,scheduled:!!raf,lastTick:last,visible:!document.hidden,motionSpeed:1-.82*speechPresence,speaking,ready:ready||fallbackActive,loadError,contextLost,transport:meshTransport?'48x48 shared vertex field':'fragment transport',timingKind:'CPU command submission, not GPU completion',backend:fallbackActive?'animated-reference':gl?'webgl-flow':'canvas-crossfade',quality:interval?'adaptive-30hz':'full',paintMs:costs.slice(),frameIntervals:intervals.slice(),reducedMotion:!!reduced?.matches,canvasPx:{width:canvas.width,height:canvas.height}}),
   dispose(){disposed=true;if(raf)root.cancelAnimationFrame(raf);resize.disconnect();root.removeEventListener('tradeflow:speech-features',speech);root.removeEventListener('tradeflow:voice-state',voice);document.removeEventListener('visibilitychange',visibility);reduced?.removeEventListener?.('change',resume);root.removeEventListener('pageshow',resume);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
    if(gl&&!contextLost){textures.forEach(t=>gl.deleteTexture(t));if(buffer)gl.deleteBuffer(buffer);if(indexBuffer)gl.deleteBuffer(indexBuffer);if(program)gl.deleteProgram(program);}}
  });
 }
 let current=null;
 function attach({root,document}={}){
  if(!root||!document)return null;current?.dispose();let disposed=false;const renderers=new Map();
  function sync(){if(disposed)return;
   for(const [host,renderer] of renderers)if(!host.isConnected||!renderer.isAttached()){renderer.dispose();renderers.delete(host);}
   for(const host of document.querySelectorAll('.tf-ai-orb,.tf-voice-wave')){
    if(renderers.has(host))continue;
    // Replace artwork only. The existing host, action, composer and voice runtime remain.
    host.querySelectorAll('.tf-orb-mesh,.tf-orb-concept-b-canvas,.tf-orb-concept-b-emblem,.tf-flow-art').forEach(e=>e.remove());
    const canvas=document.createElement('canvas');canvas.className='tf-orb-concept-b-canvas';canvas.setAttribute('aria-hidden','true');host.appendChild(canvas);host.dataset.orbMaterial=version;host.dataset.orbBackend='loading-reference';
    renderers.set(host,createRenderer(canvas,{root,document,button:host}));
   }
  }
  const primary=()=>renderers.get(document.querySelector('.tf-ai-orb'));
  const observer=new root.MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});sync();
  const api=Object.freeze({sync,active:()=>renderers.size>0,stats:()=>primary()?.stats()||null,
   surfaces:()=>Array.from(renderers,([host,r])=>({host:host.className,stats:r.stats()})),
   renderAt:(...args)=>{for(const r of renderers.values())r.renderAt(...args)},resetStats:()=>{for(const r of renderers.values())r.resetStats()},
   dispose(){disposed=true;observer.disconnect();for(const r of renderers.values())r.dispose();renderers.clear();if(current===api)current=null;}});current=api;return api;
 }

 return Object.freeze({version,frameAt,normalizeSpeech,createRenderer,attach,stats:()=>current?.stats()||null,renderAt:(...args)=>current?.renderAt(...args),resetStats:()=>current?.resetStats(),surfaces:()=>current?.surfaces()||[]});
});
