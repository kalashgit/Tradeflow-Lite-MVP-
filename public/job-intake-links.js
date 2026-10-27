/* Priority 2 — pure, offline-safe job import connections.
   No external geocoding, guessed time, background sync or duplicate calendar-event writes. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowJobIntakeLinks=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const str=x=>String(x??'').trim();
 function time(input){
  const s=str(input);
  if(!s)return '';
  const m=s.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i)||s.match(/^(\d{1,2})\s*(am|pm)$/i);
  if(!m)return null;
  let h=Number(m[1]),minute=m[2]===undefined?0:Number(m[2]),suffix=(m[3]||m[2]||'').toLowerCase();
  if(minute>59||h<0||h>23)return null;
  if(suffix==='am'||suffix==='pm'){if(h<1||h>12)return null;h=h%12+(suffix==='pm'?12:0)}
  return String(h).padStart(2,'0')+':'+String(minute).padStart(2,'0');
 }
 function duration(input){
  const s=str(input);
  if(!s)return 60;
  const m=s.match(/^(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)?$/i);
  if(!m)return null;
  const n=Number(m[1])*(m[2]&&/^h/i.test(m[2])?60:1);
  return Number.isFinite(n)&&n>=15&&n<=24*60?Math.round(n):null;
 }
 function coordinates(lat,lon,googleMaps){
  if(str(lat)||str(lon)){
   if(!str(lat)||!str(lon))return {error:'Both latitude and longitude are required'};
   const a=Number(lat),b=Number(lon);
   if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>90||Math.abs(b)>180)return {error:'Invalid coordinates'};
   return {latitude:a,longitude:b,source:'provided-coordinates'};
  }
  const url=str(googleMaps);
  if(!url)return null;
  if(!/^https:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps\/|maps\.google\.[a-z.]+\/)/i.test(url))return {error:'Use a full Google Maps place link with a selected point'};
  // Only explicitly selected Google Maps coordinates, not viewport (@) location.
  const pair=url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if(!pair)return {error:'Google Maps link has no explicit selected point; needs review'};
  const a=Number(pair[1]),b=Number(pair[2]);
  if(Math.abs(a)>90||Math.abs(b)>180)return {error:'Invalid Google Maps pin'};
  return {latitude:a,longitude:b,source:'user-provided-map-pin'};
 }
 function augment(record,values,customer){
  const r={...record},v=k=>str(values[k]),clock=time(v('scheduleTime'));
  if(clock===null)return {error:'Invalid start time (use HH:MM, e.g. 09:30)'};
  if(clock&&!r.date)return {error:'A start time needs a valid scheduled date'};
  const period=duration(v('durationMinutes'));if(period===null)return {error:'Duration must be 15–1440 minutes'};
  r.scheduleTime=r.status==='Completed'?'':clock;
  r.durationMinutes=period;
  r.address=v('address')||str(customer?.address)||'';
  r.location=r.address;
  r.intakeDateOnly=!!(r.date&&!r.scheduleTime);
  r.intakeLinkageVersion=1;
  r.intakeMapStatus='unresolved';
  const coords=coordinates(v('latitude'),v('longitude'),v('googleMapsUrl'));
  if(coords?.error)return {error:coords.error};
  if(coords){
   r.coordinates={latitude:coords.latitude,longitude:coords.longitude};
   r.intakeMapStatus='provided_unverified';
   r.intakeMapSource=coords.source;
  }else if(r.address)r.intakeMapStatus='address_pending_review';
  return {record:r};
 }
 function calendarVisible(job){
  return !(job?.intakeLinkageVersion===1&&
    (job.status==='Completed'||job.status==='Cancelled'||!job.date||!job.scheduleTime));
 }
 return Object.freeze({time,duration,coordinates,augment,calendarVisible});
});
