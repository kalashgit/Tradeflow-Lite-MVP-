/* TradeFlow location quality and deterministic match v1.
   Pure helpers: no provider calls, and never infer exact coordinates from a partial address. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowLocationQuality=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const clean=x=>String(x??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const norm=x=>clean(x).toLowerCase().replace(/\b(street|st)\b/g,'st').replace(/\b(road|rd)\b/g,'rd').replace(/\b(avenue|ave)\b/g,'ave').replace(/\b(boulevard|blvd)\b/g,'blvd').replace(/\b(drive|dr)\b/g,'dr').replace(/\b(lane|ln)\b/g,'ln').replace(/\b(court|ct)\b/g,'ct').replace(/\b(north)\b/g,'n').replace(/\b(south)\b/g,'s').replace(/\b(east)\b/g,'e').replace(/\b(west)\b/g,'w').replace(/[^a-z0-9]+/g,' ').trim();
const shortState=x=>{const t=norm(x);return ({texas:'tx',california:'ca',florida:'fl',newyork:'ny',georgia:'ga',colorado:'co',arizona:'az'})[t.replace(/\s/g,'')]||t};
const stop=new Set(['st','rd','ave','blvd','dr','ln','ct','way','n','s','e','w','the']);
function parts(record){
 const r=record||{};
 const text=clean(r.address||r.street_address||r.site_address||r.project_address||r.location||'');
 const segments=text.split(',').map(clean).filter(Boolean);
 let first=segments[0]||'';
 // Some exports use "River Place Blvd 6801"; retain it as a candidate, do not assume a precise pin.
 let m=first.match(/^(\d+[a-z]?)\s+(.+)$/i),reordered=false;
 if(!m){const tail=first.match(/^(.+?)\s+(\d+[a-z]?)$/i);if(tail){m=[tail[0],tail[2],tail[1]];reordered=true}}
 const city=clean(r.city||r.municipality||r.town|| (segments.length>=2?segments[1]:''));
 const region=clean(r.region||r.state||r.state_code|| (segments.length>=3?segments[2].replace(/\d{5}(?:-\d{4})?/,'').trim():''));
 const zip=clean(r.postal_code||r.zip||r.zip_code||((text.match(/\b\d{5}(?:-\d{4})?\b/)||[])[0]));
 return {number:m?norm(m[1]):'',street:m?norm(m[2]):'',city:norm(city),state:shortState(region),zip:zip.slice(0,5),raw:text,reordered};
}
function variants(record){
 const p=parts(record);if(!p.number||!p.street)return [];
 const first=p.number+' '+p.street;
 const context=[p.city,p.state,p.zip].filter(Boolean).join(', ');
 return [...new Set([context?first+', '+context:first,p.raw].filter(Boolean))].slice(0,2);
}
function assess(record,hit){
 const p=parts(record);if(!p.number||!p.street)return {status:'unresolved',reason:'No complete street number and name'};
 const lat=Number(hit?.lat),lon=Number(hit?.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return {status:'unresolved',reason:'Invalid coordinates'};
 const d=hit.address||{},display=norm(hit.display_name);
 const returnedNumber=norm(d.house_number||''),returnedRoad=norm(d.road||d.pedestrian||d.residential||d.street||d.footway||'');
 if(!returnedNumber||!returnedRoad)return {status:'approximate',reason:'Provider did not return a house-number-level address',lat,lon};
 if(returnedNumber!==p.number)return {status:'unresolved',reason:'House number mismatch'};
 const expected=p.street.split(' ').filter(x=>x.length>1&&!stop.has(x)),actual=new Set(returnedRoad.split(' '));
 if(!expected.length||!expected.every(x=>actual.has(x)))return {status:'unresolved',reason:'Street mismatch'};
 const postal=clean(d.postcode).slice(0,5);
 if(p.zip&&postal&&p.zip!==postal)return {status:'unresolved',reason:'Postal code mismatch'};
 const region=shortState(d.state_code||d.state);
 if(p.state&&region&&p.state!==region)return {status:'unresolved',reason:'State mismatch'};
 const locality=norm(d.city||d.town||d.village||d.municipality||d.suburb||'');
 const localityOk=!p.city||locality===p.city||display.includes(p.city);
 if(!localityOk && !(p.zip&&postal===p.zip))return {status:'unresolved',reason:'City mismatch'};
 return {status:'matched_needs_review',lat,lon,label:clean(hit.display_name),source:'geocoder',reason:'Street address matches; verify actual property pin'};
}
function choose(record,hits){
 const assessed=(Array.isArray(hits)?hits:[]).map(x=>assess(record,x));
 return assessed.find(x=>x.status==='matched_needs_review')||assessed.find(x=>x.status==='approximate')||{status:'unresolved',reason:assessed[0]?.reason||'No matching address'};
}
function hasPin(r){const lat=r?.latitude,lon=r?.longitude;return typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&r.map_enabled!==false;}
function status(r){
 if(hasPin(r))return r.map_location_status==='verified'?'verified':r.map_location_status==='approximate'?'approximate':'needs_review';
 return (r?.address||r?.street_address||r?.site_address||r?.project_address||r?.city||r?.location)?'unresolved':'no_address';
}
return Object.freeze({parts,variants,assess,choose,hasPin,status});
});
