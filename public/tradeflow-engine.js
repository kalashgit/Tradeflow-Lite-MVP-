/* TradeFlow portable engine v1.
   Provider-independent core (works in browsers, Node, Cloudflare Workers, or other JS hosts).
   No secrets, network calls, browser storage, or vendor SDK dependencies in this file.
   Host adapters supply services. Common interfaces:
     geo.geocode({street,city,region,postalCode,country,query})
       -> {candidates:[{latitude,longitude,streetNumber,streetName,city,region,postalCode,precision,providerId}]}
     ai.generate({messages,model,system,signal}) -> {text,usage?}
     store.get(key), store.set(key,value) optional for job state
     jobs.enqueue({id,type,payload}) optional durable job port
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TradeFlowEngine=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 'use strict';
 const stateCodes={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'};
 const states=Object.fromEntries(Object.entries(stateCodes).map(([code,name])=>[name.toLowerCase(),code]));
 const collapse=v=>String(v==null?'':v).normalize('NFKC').replace(/\s+/g,' ').trim();
 const simple=v=>collapse(v).toLowerCase().replace(/[.,]/g,'').replace(/\b(boulevard|blvd)\b/g,'blvd').replace(/\b(street|st)\b/g,'st').replace(/\b(avenue|ave)\b/g,'ave').replace(/\b(road|rd)\b/g,'rd').replace(/\b(drive|dr)\b/g,'dr').replace(/\b(lane|ln)\b/g,'ln').replace(/\b(court|ct)\b/g,'ct').replace(/\s+/g,' ').trim();
 const zipRegex=/\b(\d{5})(?:-\d{4})?\b/;
 const numberRegex=/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+(.+)$/;
 function stateCode(v){
  const s=collapse(v).replace(/[.,]/g,'').toLowerCase();if(!s)return '';
  const code=s.toUpperCase();return stateCodes[code]?code:(states[s]||'');
 }
 function removeCountries(s){return collapse(s).replace(/(?:,\s*|\s+)(?:United States of America|United States|USA|US)\s*$/i,'').trim()}
 function splitRegionPostal(s){
  const text=collapse(s),postalCode=(text.match(zipRegex)||[])[1]||'';
  let region=text.replace(zipRegex,'').replace(/[, ]+/g,' ').trim();
  return {region:stateCode(region),postalCode};
 }
 function normalizeAddress(input){
  const record=typeof input==='string'?{address:input}:input&&typeof input==='object'?input:{};
  const original=collapse(record.address||record.street_address||record.site_address||record.project_address||record.full_address||record.location||record.city||'');
  const rawStreet=collapse(record.address||record.street_address||record.site_address||record.project_address||record.street||record.full_address||record.location||'');
  const rawCity=collapse(record.city||record.locality||record.town||'');
  const rawRegion=collapse(record.region||record.state||record.state_code||record.province||'');
  const rawZip=collapse(record.postal_code||record.zip||record.zip_code||record.postcode||'');
  const country=collapse(record.country||record.country_code||'US').toUpperCase();
  // US parser only; other countries will use country-specific adapters.
  if(!['US','USA','UNITED STATES','UNITED STATES OF AMERICA'].includes(country))return {original,street:rawStreet,city:rawCity,region:rawRegion,postalCode:rawZip,country,parsed:false,reason:'unsupported-country'};
  const parts=removeCountries(rawStreet||original).split(',').map(collapse).filter(Boolean);
  const full=removeCountries(rawStreet||original);
  let street='',city='',region=stateCode(rawRegion),postalCode=(rawZip.match(zipRegex)||[])[1]||'';
  // Standard form: street, city, TX 78726, Texas; duplicates removed by normalization.
  if(parts.length>=2&&numberRegex.test(parts[0])){
   street=parts[0];city=parts[1];
   for(const part of parts.slice(2)){
    const rp=splitRegionPostal(part);
    if(!region&&rp.region)region=rp.region;
    if(!postalCode&&rp.postalCode)postalCode=rp.postalCode;
   }
  }else if(numberRegex.test(full)){
   // Non-comma form: 6801 River Place Blvd Austin TX 78726.
   const tail=full.match(/^(.*?)\s+([A-Za-z][A-Za-z .'-]+?)\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s+(\d{5}(?:-\d{4})?)$/i);
   if(tail){street=tail[1];city=tail[2];if(!region)region=tail[3].toUpperCase();if(!postalCode)postalCode=(tail[4].match(zipRegex)||[])[1]}
   else street=parts[0]||full;
  }else if(parts.length>=2&&numberRegex.test(parts[1])){
   // City first: Austin TX, 6801 River Place Blvd, 78726.
   street=parts[1];city=parts[0].replace(/\b[A-Z]{2}\b/gi,part=>stateCodes[part.toUpperCase()]?'':part).trim();
   for(const part of parts){const rp=splitRegionPostal(part);if(!region&&rp.region)region=rp.region;if(!postalCode&&rp.postalCode)postalCode=rp.postalCode}
  }else{
   street=rawStreet&&!numberRegex.test(rawStreet)?rawStreet:parts[0]||'';
  }
  if(!street&&rawStreet)street=rawStreet;
  if(!street&&numberRegex.test(rawCity))street=parts[0]||rawCity;
  if(!city&&rawCity&&rawCity!==original&&!numberRegex.test(rawCity))city=rawCity;
  if(!postalCode)postalCode=(full.match(zipRegex)||[])[1]||'';
  if(!region){const match=full.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s+\d{5}\b/i);if(match)region=match[1].toUpperCase()}
  // Existing dedicated street field may include full address, but it should not be truncated.
  const match=street.match(numberRegex);
  const parsed=!!match&&!!city&&!!region;
  const normalized=parsed?[street,city,[region,postalCode].filter(Boolean).join(' '),'US'].join(', '):'';
  return {original,street,streetNumber:match?.[1]||'',streetName:match?.[2]||'',city,region,postalCode,country:'US',normalized,parsed,reason:parsed?'':'missing-components'};
 }
 function canonicalKey(a){
  const r=a&&a.streetNumber?a:normalizeAddress(a);
  return [simple(r.streetNumber),simple(r.streetName),simple(r.city),stateCode(r.region),String(r.postalCode||'').slice(0,5),r.country||'US'].join('|');
 }
 function candidateScore(a,hit){
  if(!a?.streetNumber||!hit)return {score:0,confidence:'unresolved',reasons:['no-street-or-hit']};
  const cn=collapse(hit.streetNumber||''),street=simple(hit.streetName||''),city=simple(hit.city||''),region=stateCode(hit.region),zip=collapse(hit.postalCode||'').slice(0,5);
  const reasons=[];
  if(cn!==collapse(a.streetNumber))return {score:0,confidence:'rejected',reasons:['different-building-number']};
  let score=35;
  if(street&&street===simple(a.streetName))score+=35;else if(street&&simple(a.streetName).includes(street))score+=22;else reasons.push('street-not-confirmed');
  if(city&&city===simple(a.city))score+=10;else reasons.push('city-unconfirmed');
  if(region&&region===stateCode(a.region))score+=10;else reasons.push('state-unconfirmed');
  if(zip&&zip===String(a.postalCode).slice(0,5))score+=10;else reasons.push('zip-unconfirmed');
  const precise=String(hit.precision||'').toLowerCase();
  const confidence=score>=90&&['rooftop','address','building'].includes(precise)?'high':score>=70?'approximate':'review';
  return {score,confidence,reasons};
 }
 function makeEngine(ports){
  const {geo,ai,store,jobs}=ports||{};
  const assertPort=(port,method)=>{if(!port||typeof port[method]!=='function')throw Error('Missing provider adapter: '+method)};
  return Object.freeze({
   parseAddress:normalizeAddress,canonicalKey,candidateScore,
   async geocode(input){
    assertPort(geo,'geocode');
    const address=normalizeAddress(input);
    if(!address.parsed)return {status:'needs_review',address,reason:address.reason};
    const response=await geo.geocode({street:address.street,city:address.city,region:address.region,postalCode:address.postalCode,country:address.country,query:address.normalized});
    const candidates=(response?.candidates||[]).map(x=>({candidate:x,match:candidateScore(address,x)})).sort((a,b)=>b.match.score-a.match.score);
    const best=candidates[0];
    return {status:best&&best.match.score>=70?'mapped':'needs_review',address,match:best?.match||null,candidate:best?.candidate||null};
   },
   async generate(request){assertPort(ai,'generate');return ai.generate(request)},
   async read(key){assertPort(store,'get');return store.get(key)},
   async write(key,value){assertPort(store,'set');return store.set(key,value)},
   async queue(task){assertPort(jobs,'enqueue');return jobs.enqueue(task)}
  });
 }
 return Object.freeze({version:'1.0.0',normalizeAddress,canonicalKey,candidateScore,makeEngine,stateCode});
});
