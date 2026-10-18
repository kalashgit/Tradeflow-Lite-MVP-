/* TradeFlow Appearance Intelligence v1: portable, deterministic contrast-safe palettes.
   User hue is preserved; interface accent can be lifted for legibility on graphite.
   No external libraries, network, device or provider calls. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowAppearance=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const clamp=(v,lo=0,hi=255)=>Math.min(hi,Math.max(lo,v));
 const hexToRgb=hex=>{if(!/^#[0-9a-f]{6}$/i.test(hex||''))return null;return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))};
 const toHex=rgb=>'#'+rgb.map(v=>Math.round(clamp(v)).toString(16).padStart(2,'0')).join('');
 const mix=(a,b,t)=>toHex(a.map((v,i)=>v+(b[i]-v)*t));
 const lin=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
 const luminance=rgb=>rgb.reduce((n,v,i)=>n+lin(v)*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>{const x=luminance(hexToRgb(a)),y=luminance(hexToRgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 const usable=(raw,background,minimum)=>{const base=hexToRgb(raw);if(contrast(raw,background)>=minimum)return raw.toLowerCase();for(let i=1;i<=100;i++){const value=mix(base,[255,255,255],i/100);if(contrast(value,background)>=minimum)return value}return '#ffffff'};
 function palette(value){
  const raw=hexToRgb(value)?value.toLowerCase():'#10cfe1';
  const bg='#111214',raised='#34363b',white='#f5f5f5',black='#111214';
  const text=usable(raw,raised,4.5);
  const action=usable(raw,raised,4.5);
  const onAction=contrast(action,black)>=contrast(action,white)?black:white;
  const border='#34373d';
  const rgb=hexToRgb(action);
  return Object.freeze({
   original:raw,accent:action,accentText:text,onAccent:onAction,bg,raised,border,
   muted:'#a9adb2',text:'#f5f5f5',secondary:'#a9adb2',
   rgb:rgb.join(' '),income:'#00ed64',expense:'#ff334d',
   contrastOnButton:contrast(action,onAction),contrastLabel:contrast(text,raised)
  });
 }
 function apply(value,style){
  const p=palette(value);
  const target=style||((typeof document!=='undefined')?document.documentElement.style:null);
  if(!target)return p;
  const entries={
   '--tf-accent-original':p.original,'--brand-accent':p.accent,'--tf-accent':p.accent,
   '--tf-action-cyan':p.accent,'--tf-action-cyan-hover':p.accent,
   '--tf-accent-text':p.accentText,'--tf-accent-contrast':p.onAccent,
   '--tf-accent-rgb':p.rgb,
   '--tf-income-neon':p.income,'--tf-expense-neon':p.expense
  };
  Object.entries(entries).forEach(([key,color])=>target.setProperty(key,color));
  return p;
 }
 return Object.freeze({palette,apply,contrast});
});
