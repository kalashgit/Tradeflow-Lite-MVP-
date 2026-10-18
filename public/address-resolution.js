/* TradeFlow Address Resolution v1 — portable, conservative matching.
   Provider inputs are untrusted. A provider hit is never proof of a delivery address.
   No network / storage dependencies inside this module. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowAddress=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const clean=v=>String(v==null?'':v).trim().replace(/\s+/g,' ');
 const norm=v=>clean(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const ignored=new Set(['street','st','road','rd','ave','avenue','boulevard','blvd','drive','dr','way','lane','ln','court','ct','place','pl','square','sq','strasse','str','οδος','οδός','leoforos','λεωφορος','route','highway','n','s','e','w']);
 const valid=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
 function googlePinCoordinates(input){
  const text=clean(input);
  if(!/^https:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps\/|maps\.google\.[a-z.]+\/|maps\.app\.goo\.gl\/)/i.test(text))return null;
  // !3d/!4d represent a selected Google Maps point. @lat,lon alone is viewport center, not a verified place.
  const pair=text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if(pair){const lat=Number(pair[1]),lon=Number(pair[2]);if(valid(lat,lon))return {lat,lon,source:'google-map-point'}}
  try{
   const url=new URL(text),value=url.searchParams.get('q')||url.searchParams.get('query')||'';
   const m=value.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
   if(m&&valid(Number(m[1]),Number(m[2])))return {lat:Number(m[1]),lon:Number(m[2]),source:'google-map-point'};
  }catch{}
  return null;
 }
 function queries(address){
  const text=clean(address),parts=text.split(',').map(clean).filter(Boolean),result=[];
  for(const s of [text,parts.length>=4?parts.slice(0,3).join(', '):'',parts.length>2?parts.slice(0,2).join(', '):'']){
   if(s&&!result.some(x=>norm(x)===norm(s)))result.push(s)
  }
  return result.slice(0,2);
 }
 function assess(address,hit){
  const lat=Number(hit?.lat),lon=Number(hit?.lon);
  if(!valid(lat,lon))return null;
  const display=clean(hit.display_name||''),details=hit.address||{};
  if(!display)return null;
  const query=clean(address);
  const first=clean(query.split(',')[0]),tokens=norm(first).split(' ').filter(Boolean);
  const number=tokens.find(t=>/^\d+[a-z]?$/.test(t))||'';
  const sourceStreet=tokens.filter(t=>t!==number&&!ignored.has(t)&&t.length>=3);
  const candidateNumber=norm(details.house_number||'');
  const namedRoad=norm(details.road||details.pedestrian||details.residential||details.street||details.footway||display);
  const candidateTokens=namedRoad.split(' ');
  const displayTokens=norm(display).split(' ');
  const zip=(query.split(',').slice(1).join(',').match(/\b\d{4,6}(?:-\d{4})?\b/)||query.match(/\b\d{5}(?:-\d{4})?\b/)||[])[0]||'';
  const candidateZip=clean(details.postcode||'');
  const zipMismatch=zip&&candidateZip&&zip!==candidateZip&&zip.slice(0,5)!==candidateZip.slice(0,5);
  const numberMatch=number&&(candidateNumber?number===candidateNumber:displayTokens.includes(number));
  const streetMatch=sourceStreet.length>0&&sourceStreet.every(w=>candidateTokens.includes(w));
  const locality=clean(query.split(',')[1]||'');
  const localityTokens=norm(locality).split(' ').filter(x=>x.length>=4);
  const locationMatch=!localityTokens.length||localityTokens.some(x=>displayTokens.includes(x))||(zip&&candidateZip&&zip.slice(0,5)===candidateZip.slice(0,5));
  const strong=Boolean(number&&numberMatch&&streetMatch&&locationMatch&&!zipMismatch);
  return {lat,lon,display,confidence:strong?'high':'needs_review',source:'address-lookup'};
 }
 function select(address,hits){
  const scored=(Array.isArray(hits)?hits:[]).map(x=>assess(address,x)).filter(Boolean);
  const best=scored.find(x=>x.confidence==='high')||scored[0]||null;
  return best;
 }
 return Object.freeze({googlePinCoordinates,queries,assess,select});
});