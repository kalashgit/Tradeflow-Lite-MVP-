// AION GKB-02: strictly scoped public economic-data importers, NOT live app APIs.
// Opt-in only. No browser use, company identity, customer data, private competitor
// records or proprietary estimating database access. No automatic promotion.
// Historical rows must retain original observation year/location/series and a
// source identity; they cannot be represented as current supplier prices.
'use strict';
const {createHash}=require('node:crypto');
const API_VERSION='AIONPublicEconomicSnapshot/1';
const MAX_BYTES=512*1024;
const CENSUS_ORIGIN='https://api.census.gov';
const BLS_ORIGIN='https://api.bls.gov';
const YEAR=2023;
function boundedResponse(fetchImpl,url,options){
 if(typeof fetchImpl!=='function')throw Error('HTTP reader transport required');
 if(!(url instanceof URL)||
    ![CENSUS_ORIGIN,BLS_ORIGIN].includes(url.origin))throw Error('Unapproved economic endpoint');
 return fetchImpl(url.href,{
  ...options,method:options.method||'GET',redirect:'error',credentials:'omit',
  cache:'no-store',signal:AbortSignal.timeout(10000),
  headers:{Accept:'application/json',...(options.headers||{})},
 });
}
async function bodyJSON(response,maxBytes=MAX_BYTES){
 if(!response||response.ok!==true||response.status!==200)throw Error('Economic source unavailable');
 const actualUrl=response.url?new URL(response.url):null;
 if(actualUrl&&![CENSUS_ORIGIN,BLS_ORIGIN].includes(actualUrl.origin))
  throw Error('Unexpected economic response origin');
 const type=response.headers?.get?.('content-type')||'';
 if(!/^application\/json(?:\s*;|$)/i.test(type))throw Error('Economic response MIME must be JSON');
 const len=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(len)&&len>maxBytes)throw Error('Economic source response too large');
 const reader=response.body?.getReader?.();
 if(!reader)throw Error('Streaming economic data required');
 let n=0;const chunks=[];
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   if(!(value instanceof Uint8Array))throw Error('Bad streamed economic body');
   n+=value.byteLength;if(n>maxBytes)throw Error('Economic source exceeds byte budget');
   chunks.push(Buffer.from(value));
  }
 }catch(e){await reader.cancel().catch(()=>{});throw e}finally{reader.releaseLock()}
 const raw=Buffer.concat(chunks);
 let parsed;try{parsed=JSON.parse(raw.toString('utf8'))}catch{throw Error('Invalid agency JSON')}
 return {parsed,sha256:createHash('sha256').update(raw).digest('hex'),size:n};
}
const digits=(x,name)=>{if(typeof x!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(x)||
 x.length>18)throw Error('Invalid published '+name);const n=Number(x);
 if(!Number.isSafeInteger(n))throw Error('Unsafe published '+name);return n};
async function importCBP2023({stateFips,apiKey,fetchImpl=globalThis.fetch}={}){
 if(typeof stateFips!=='string'||!/^(0[1-9]|[1-4][0-9]|5[0-6])$/.test(stateFips)||
    typeof apiKey!=='string'||!/^[A-Za-z0-9]{12,100}$/.test(apiKey))
  throw Error('2023 CBP import needs permitted 2-digit state FIPS and user-provided Census API key');
 const url=new URL('/data/2023/cbp',CENSUS_ORIGIN);
 url.searchParams.set('get','NAME,NAICS2017,ESTAB,EMP,PAYANN');
 url.searchParams.set('for','state:'+stateFips);
 url.searchParams.set('NAICS2017','238210');
 url.searchParams.set('LFO','001');
 url.searchParams.set('EMPSZES','001');
 url.searchParams.set('GEOCOMP','S0');
 url.searchParams.set('key',apiKey);
 const response=await boundedResponse(fetchImpl,url,{});
 const {parsed,sha256,size}=await bodyJSON(response);
 if(!Array.isArray(parsed)||parsed.length!==2||!Array.isArray(parsed[0])||
    !Array.isArray(parsed[1]))throw Error('Unexpected published CBP table layout');
 const head=parsed[0],data=parsed[1],idx=name=>head.indexOf(name);
 for(const name of ['NAME','NAICS2017','ESTAB','EMP','PAYANN','state'])
  if(idx(name)<0)throw Error('Missing CBP variable '+name);
 const row=name=>data[idx(name)];
 if(row('NAICS2017')!=='238210'||row('state')!==stateFips)throw Error('CBP geographic/industry mismatch');
 if(typeof row('NAME')!=='string'||row('NAME').length<2||row('NAME').length>200)
  throw Error('Invalid agency geographic label');
 return Object.freeze({
  schema:API_VERSION,provider:'US Census / County Business Patterns',
  dataset:'CBP',year:YEAR,naics:'238210',geography:'state',stateFips,
  geographyLabel:row('NAME'),establishments:digits(row('ESTAB'),'establishments'),
  employees:digits(row('EMP'),'employees'),
  annualPayrollAsPublished:digits(row('PAYANN'),'annual payroll'),
  annualPayrollUnit:'Census CBP PAYANN published units; confirm unit in dataset metadata before converting',
  sourceUrl:CENSUS_ORIGIN+'/data/2023/cbp',
  sourceId:'census-cbp',observationType:'historical_aggregate',
  sourceResponseSha256:sha256,sourceBytes:size,retrievedAt:new Date().toISOString(),
  officialSource:true,mayClaimCompetitorProfit:false,
  cannotUseAsCustomerRecord:true,automaticModelPromotion:false,
 });
}
async function importBLSSeries({seriesId,startYear,endYear,fetchImpl=globalThis.fetch}={}){
 if(typeof seriesId!=='string'||!/^[A-Z0-9_#-]{4,36}$/.test(seriesId)||
    !Number.isSafeInteger(startYear)||!Number.isSafeInteger(endYear)||
    startYear<2000||endYear>2026||startYear>endYear||
    endYear-startYear>9)throw Error('Invalid BLS series or unregistered historic window');
 const url=new URL('/publicAPI/v1/timeseries/data/',BLS_ORIGIN);
 const payload={seriesid:[seriesId],startyear:String(startYear),endyear:String(endYear)};
 const response=await boundedResponse(fetchImpl,url,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
 });
 const {parsed,sha256,size}=await bodyJSON(response);
 if(parsed?.status!=='REQUEST_SUCCEEDED'||!Array.isArray(parsed?.Results?.series)||
    parsed.Results.series.length!==1||parsed.Results.series[0].seriesID!==seriesId||
    !Array.isArray(parsed.Results.series[0].data))throw Error('BLS agency response invalid or series mismatch');
 const raw=parsed.Results.series[0].data;if(raw.length>1000)throw Error('BLS response exceeds row budget');
 const observed=raw.map(r=>{
  const year=Number(r.year);
  if(!Number.isSafeInteger(year)||year<startYear||year>endYear||
     typeof r.period!=='string'||!/^M(0[1-9]|1[0-2])$/.test(r.period)||
     typeof r.value!=='string'||!/^[-+]?[0-9,]+(?:\.[0-9]+)?$/.test(r.value))
   throw Error('BLS observation schema invalid');
  const value=Number(r.value.replace(/,/g,''));if(!Number.isFinite(value))throw Error('BLS numeric overflow');
  return {period:String(year)+'-'+r.period.slice(1),value,footnotes:r.footnotes||[]};
 }).sort((a,b)=>a.period.localeCompare(b.period));
 if(observed.some((r,i)=>i&&r.period===observed[i-1].period))throw Error('BLS duplicate observations');
 return Object.freeze({
  schema:API_VERSION,provider:'US Bureau of Labor Statistics',
  dataset:'publicAPI/v1',seriesId,sourceId:'bls-api',
  requestedYears:[startYear,endYear],
  unit:'UNVERIFIED_SERIES_SPECIFIC_UNIT',
  unitsRequireIndependentMetadata:true,
  observations:observed,observationType:'historical_timeseries',
  sourceUrl:BLS_ORIGIN+'/publicAPI/v1/timeseries/data/',
  sourceResponseSha256:sha256,sourceBytes:size,retrievedAt:new Date().toISOString(),
  officialSource:true,notAnOccupationalWageWithoutMetadata:true,
  cannotUseAsCustomerRecord:true,automaticModelPromotion:false,
 });
}
module.exports={API_VERSION,MAX_BYTES,importCBP2023,importBLSSeries,bodyJSON};
