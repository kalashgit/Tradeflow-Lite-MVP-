'use strict';
// Founder screenshot visual contract: measure rendered DOM and actual orb pixels.
// Reference coordinates are normalized from the approved user image, excluding browser chrome.
// Different viewport aspect ratios prevent meaningful full-frame pixel equality.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const reference={
 header:{x:.028,y:.004,width:.905,height:.064},
 orb:{x:.348,y:.142,width:.278,height:.232},
 heading:{x:.219,y:.403,width:.551,height:.050},
 subtitle:{x:.147,y:.462,width:.711,height:.030},
 ready:{x:.361,y:.510,width:.262,height:.044},
 cards:{x:.055,y:.604,width:.866,height:.139},
 composer:{x:.036,y:.932,width:.898,height:.064}
};
async function verifyVisualReference(page,output,viewport){
 const selectors={header:'.tf-master-header',orb:'.tf-master-orb',heading:'.tf-master-welcome h1',subtitle:'.tf-master-welcome>p',ready:'.tf-master-ready',cards:'.tf-master-starters',composer:'.tf-master-compose'};
 const snapshot=await page.evaluate(mapping=>{
  const root=document.querySelector('.tf-master').getBoundingClientRect();
  const boxes={};
  for(const [key,selector] of Object.entries(mapping)){
   const node=document.querySelector(selector);
   if(!node)throw Error('Missing visual acceptance element '+selector);
   const rect=node.getBoundingClientRect();
   boxes[key]={x:(rect.left-root.left)/root.width,y:(rect.top-root.top)/root.height,width:rect.width/root.width,height:rect.height/root.height};
  }
  return {root:{width:root.width,height:root.height},boxes};
 },selectors);
 const filename=viewport.name+'-visual-candidate.png';
 await page.locator('.tf-master').screenshot({path:path.join(output,filename)});
 const samples=[];
 for(let i=0;i<3;i++){
  const buffer=await page.locator('.tf-master-orb').screenshot();
  const sample=await page.evaluate(async encoded=>{
   const img=new Image();
   img.src='data:image/png;base64,'+encoded;
   await img.decode();
   const canvas=document.createElement('canvas');
   canvas.width=img.width;canvas.height=img.height;
   const context=canvas.getContext('2d',{willReadFrequently:true});
   context.drawImage(img,0,0);
   const bytes=context.getImageData(0,0,img.width,img.height).data;
   let all=0,cyan=0,bright=0,greenPeak=0;
   for(let p=0;p<bytes.length;p+=4){
    const r=bytes[p],g=bytes[p+1],b=bytes[p+2];
    all++;greenPeak=Math.max(greenPeak,g);
    if(b>r*1.4&&g>r*1.5&&g>70){cyan++;if(g>160&&b>170)bright++}
   }
   return {cyanPercent:cyan*100/all,brightCyanPercent:bright*100/all,greenPeak};
  },buffer.toString('base64'));
  samples.push(sample);
  await page.waitForTimeout(180);
 }
 const color=samples.sort((a,b)=>b.brightCyanPercent-a.brightCyanPercent)[0];
 const checks={
  headingWidth:Math.abs(snapshot.boxes.heading.width-reference.heading.width)<=.06,
  subtitleWidth:Math.abs(snapshot.boxes.subtitle.width-reference.subtitle.width)<=.075,
  readyWidth:Math.abs(snapshot.boxes.ready.width-reference.ready.width)<=.075,
  cardsWidth:Math.abs(snapshot.boxes.cards.width-reference.cards.width)<=.06,
  headingY:Math.abs(snapshot.boxes.heading.y-reference.heading.y)<=.085,
  cardsY:Math.abs(snapshot.boxes.cards.y-reference.cards.y)<=.085,
  orbBrightCyan:color.brightCyanPercent>=3,
  orbGreenPeak:color.greenPeak>=185
 };
 const {width,height}=snapshot.root;
 const draw=(name,b,stroke,dashed)=>{
  const n=x=>(x).toFixed(1);
  return '<rect x="'+n(b.x*width)+'" y="'+n(b.y*height)+'" width="'+n(b.width*width)+'" height="'+n(b.height*height)+'" fill="none" stroke="'+stroke+'" stroke-width="2" '+(dashed?'stroke-dasharray="8 5"':'')+'/>'+
   '<text x="'+n(b.x*width+4)+'" y="'+n(Math.max(15,b.y*height-4))+'" fill="'+stroke+'" font-size="12" font-family="sans-serif">'+name+'</text>';
 };
 const svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'+
  '<image xlink:href="'+filename+'" width="'+width+'" height="'+height+'"/>'+
  Object.entries(reference).map(([k,v])=>draw(k,v,'#15d9f8',true)).join('')+
  Object.entries(snapshot.boxes).map(([k,v])=>draw(k,v,'#ff779e',false)).join('')+
  '<rect x="4" y="'+(height-29)+'" width="330" height="25" fill="#000c"/>'+
  '<text x="11" y="'+(height-11)+'" fill="#15d9f8" font-size="12">Dashed: reference</text>'+
  '<text x="173" y="'+(height-11)+'" fill="#ff779e" font-size="12">Solid: actual</text></svg>';
 fs.writeFileSync(path.join(output,viewport.name+'-visual-overlay.svg'),svg);
 fs.writeFileSync(path.join(output,viewport.name+'-visual-metrics.json'),JSON.stringify({viewport,reference,actual:snapshot.boxes,orbColor:color,checks,warning:'Reference and captured viewport have different aspect ratios; geometry is normalized, not whole-image pixel matching.'},null,2));
 console.log('Founder visual QA',viewport.name,JSON.stringify({checks,orb:color}));
 // Founder supplied a mobile reference. Desktop screenshot is archived but not compared to a mobile baseline.
 if(viewport.name==='mobile'){
  const failures=Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name);
  assert.equal(failures.length,0,'Founder visual mismatches: '+failures.join(', '));
 }
}
module.exports={verifyVisualReference};
