/* TradeFlow Flow Wave v2: original multilayer translucent light ribbons.
   Pure SVG, no bitmaps, dependencies or network resources. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowFlowWave=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const W=640,H=238,C=119;
const f=n=>Number(n).toFixed(2);
function profile(x,phase,amplitude){
 const t=x/W,edge=Math.pow(Math.sin(Math.PI*t),.72);
 const wave=Math.sin(t*Math.PI*3.9+phase)*.57+Math.sin(t*Math.PI*2.35-phase*.7)*.31+Math.sin(t*Math.PI*6.1+phase*.4)*.12;
 return C+edge*amplitude*wave;
}
function line(phase,amp,offset=0){
 let result='';for(let x=0;x<=W;x+=8){const y=profile(x,phase,amp)+offset*Math.sin(Math.PI*x/W);result+=(x?' L':'M')+f(x)+' '+f(y)}return result;
}
function ribbon(phase,amp,thickness){
 const upper=[],lower=[];
 for(let x=0;x<=W;x+=8){const t=x/W;const width=thickness*Math.pow(Math.sin(Math.PI*t),.78)*(0.72+0.28*Math.sin(t*Math.PI*2+phase)**2);const y=profile(x,phase,amp);upper.push([x,y-width]);lower.push([x,y+width])}
 return upper.map(([x,y],i)=>(i?'L':'M')+f(x)+' '+f(y)).join(' ')+lower.reverse().map(([x,y])=>' L'+f(x)+' '+f(y)).join('')+' Z';
}
function render(){
 const streams=[
  {p:-.60,a:76,w:37,fill:'flowRibbonA',opacity:.58},
  {p:1.12,a:66,w:33,fill:'flowRibbonB',opacity:.56},
  {p:2.48,a:68,w:31,fill:'flowRibbonC',opacity:.52},
  {p:3.89,a:63,w:29,fill:'flowRibbonD',opacity:.36},
  {p:5.28,a:60,w:27,fill:'flowRibbonE',opacity:.29}
 ];
 const defs='<defs>'+
  '<linearGradient id="flowRibbonA" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0c487e" stop-opacity=".05"/><stop offset=".25" stop-color="#107ab5" stop-opacity=".54"/><stop offset=".49" stop-color="#4bdef4" stop-opacity=".82"/><stop offset=".72" stop-color="#0089d5" stop-opacity=".61"/><stop offset="1" stop-color="#5f58d4" stop-opacity=".23"/></linearGradient>'+
  '<linearGradient id="flowRibbonB" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#115fa6" stop-opacity=".09"/><stop offset=".33" stop-color="#00d0ef" stop-opacity=".84"/><stop offset=".62" stop-color="#159fe1" stop-opacity=".55"/><stop offset=".86" stop-color="#387de5" stop-opacity=".6"/><stop offset="1" stop-color="#8666c9" stop-opacity=".18"/></linearGradient>'+
  '<linearGradient id="flowRibbonC" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0d467a" stop-opacity=".14"/><stop offset=".28" stop-color="#25a3c8" stop-opacity=".59"/><stop offset=".54" stop-color="#0677bd" stop-opacity=".42"/><stop offset=".83" stop-color="#725bd2" stop-opacity=".61"/><stop offset="1" stop-color="#9c6ce1" stop-opacity=".16"/></linearGradient>'+
  '<linearGradient id="flowRibbonD" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2565a3" stop-opacity=".02"/><stop offset=".4" stop-color="#1d72af" stop-opacity=".55"/><stop offset=".68" stop-color="#04c2e7" stop-opacity=".51"/><stop offset="1" stop-color="#5c8fde" stop-opacity=".1"/></linearGradient>'+
  '<linearGradient id="flowRibbonE" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2862a9" stop-opacity=".02"/><stop offset=".42" stop-color="#164d89" stop-opacity=".5"/><stop offset=".84" stop-color="#2a89cd" stop-opacity=".56"/><stop offset="1" stop-color="#9c7ce9" stop-opacity=".13"/></linearGradient>'+
  '<linearGradient id="flowTrace" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#137eab" stop-opacity=".12"/><stop offset=".29" stop-color="#20d4ee" stop-opacity=".75"/><stop offset=".53" stop-color="#affaff" stop-opacity=".92"/><stop offset=".77" stop-color="#20bfe7" stop-opacity=".68"/><stop offset="1" stop-color="#8066e4" stop-opacity=".19"/></linearGradient>'+
  '<radialGradient id="flowAura"><stop offset="0" stop-color="#107aa7" stop-opacity=".28"/><stop offset=".55" stop-color="#065a8e" stop-opacity=".13"/><stop offset="1" stop-color="#02527e" stop-opacity="0"/></radialGradient>'+
  '<filter id="flowBloom" x="-25%" y="-90%" width="150%" height="280%"><feGaussianBlur stdDeviation="6"/></filter>'+
  '<filter id="flowFineGlow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="1.7"/></filter>'+
  '<linearGradient id="flowFade"><stop offset="0" stop-color="black"/><stop offset=".1" stop-color="white"/><stop offset=".88" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>'+
  '<mask id="flowEdgeMask"><rect width="640" height="238" fill="url(#flowFade)"/></mask>'+
  '</defs>';
 const blobs=streams.map((s,i)=>'<path class="tf-flow-ribbon tf-flow-ribbon-'+i+'" d="'+ribbon(s.p,s.a,s.w)+'" fill="url(#'+s.fill+')" opacity="'+s.opacity+'"/>').join('');
 const strands=streams.map((s,i)=>Array.from({length:9},(_,j)=>'<path class="tf-flow-fiber" d="'+line(s.p,s.a,(j-4)*s.w/7)+'" fill="none" stroke="url(#flowTrace)" opacity="'+f(.08+(.12-(Math.abs(j-4)*.017)))+'" stroke-width=".66"/>').join('')).join('');
 const crests=[line(-.60,76,-15),line(1.12,66,12),line(2.48,68,-8)].map((d,i)=>'<path d="'+d+'" stroke="url(#flowTrace)" stroke-width="'+(i?'.95':'1.65')+'" fill="none" opacity="'+(i?'.61':'.94')+'"/>').join('');
 return '<svg class="tf-flow-art" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'+defs+
 '<ellipse cx="340" cy="121" rx="300" ry="92" fill="url(#flowAura)"/>'+
 '<g mask="url(#flowEdgeMask)"><g filter="url(#flowBloom)" opacity=".65">'+blobs+'</g>'+
 '<g class="tf-flow-ribbon-group">'+blobs+strands+'</g>'+
 '<g filter="url(#flowFineGlow)" opacity=".67">'+crests+'</g><g>'+crests+'</g></g>'+
 '</svg>';
}
return Object.freeze({render});
});
