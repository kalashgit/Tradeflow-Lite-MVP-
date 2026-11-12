'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {importCBP2023,importBLSSeries,MAX_BYTES}=require('../src/genesis-economic-data-import.cjs');
const CBP=[['NAME','NAICS2017','ESTAB','EMP','PAYANN','state'],
 ['Alabama','238210','1267','15001','987654','01']];
const BLS={status:'REQUEST_SUCCEEDED',Results:{series:[{
 seriesID:'CEU0800000003',data:[
  {year:'2025',period:'M12',value:'36.9',footnotes:[]},
  {year:'2024',period:'M12',value:'35.1',footnotes:[]}
 ]}]}};
const reader=(payload,options={})=>new Response(JSON.stringify(payload),{
 status:options.status||200,headers:{'content-type':options.type||'application/json'}
});
test('Census CBP input rejects missing API key and unsupported geography before fetch',async()=>{
 for(const args of [{stateFips:'01'}, {stateFips:'random',apiKey:'x'.repeat(30)},
  {stateFips:'01',apiKey:'bad'},{stateFips:'57',apiKey:'x'.repeat(30)}]){
  await assert.rejects(()=>importCBP2023({...args,fetchImpl:()=>{throw Error('should not fetch')}}),/needs permitted/);
 }
});
test('Census source data is fetched from a fixed URL and no API key leaks to output',async()=>{
 const key='AIONTESTKEY000000000000000000000000000000';
 let request;
 const obj=await importCBP2023({stateFips:'01',apiKey:key,fetchImpl:async(url,options)=>{
  request={url,options};return reader(CBP);
 }});
 const parsed=new URL(request.url);
 assert.equal(parsed.hostname,'api.census.gov');
 assert.equal(parsed.pathname,'/data/2023/cbp');
 assert.equal(parsed.searchParams.get('key'),key);
 assert.equal(parsed.searchParams.get('NAICS2017'),'238210');
 assert.equal(parsed.searchParams.get('for'),'state:01');
 assert.equal(parsed.searchParams.get('GEOCOMP'),'S0');
 assert.equal(request.options.redirect,'error');
 assert.equal(request.options.credentials,'omit');
 assert.equal(obj.sourceId,'census-cbp');
 assert.equal(obj.year,2023);
 assert.equal(obj.establishments,1267);
 assert.equal(obj.employees,15001);
 assert.equal(obj.annualPayrollAsPublished,987654);
 assert.ok(obj.annualPayrollUnit.includes('confirm unit'));
 assert.equal(obj.cannotUseAsCustomerRecord,true);
 assert.equal(obj.automaticModelPromotion,false);
 assert.ok(!JSON.stringify(obj).includes(key),'API secret must never be returned');
 assert.ok(/^[a-f0-9]{64}$/.test(obj.sourceResponseSha256));
});
test('Census refuses result rows for wrong industry or state, missing columns or suppressed numeric values',async()=>{
 for(const invalid of [
  [CBP[0],[...CBP[1].slice(0,1),'999999',...CBP[1].slice(2)]],
  [CBP[0],[...CBP[1].slice(0,5),'02']],
  [['NAME','NAICS2017','ESTAB'],['Alabama','238210','100']],
  [CBP[0],['Alabama','238210','D','100','10','01']]
 ]){
  await assert.rejects(()=>importCBP2023({stateFips:'01',apiKey:'x'.repeat(40),
   fetchImpl:async()=>reader(invalid)}),/mismatch|Missing|Invalid|Unexpected/);
 }
});
test('BLS public series returns dated observations without inventing occupations or units',async()=>{
 let posted;
 const result=await importBLSSeries({seriesId:'CEU0800000003',startYear:2024,endYear:2025,
  fetchImpl:async(url,options)=>{posted={url,options};return reader(BLS)}});
 assert.equal(new URL(posted.url).hostname,'api.bls.gov');
 assert.equal(posted.options.method,'POST');
 const req=JSON.parse(posted.options.body);
 assert.deepEqual(req,{seriesid:['CEU0800000003'],startyear:'2024',endyear:'2025'});
 assert.deepEqual(result.observations.map(x=>x.period),['2024-12','2025-12']);
 assert.equal(result.observations[0].value,35.1);
 assert.equal(result.unit,'UNVERIFIED_SERIES_SPECIFIC_UNIT');
 assert.equal(result.unitsRequireIndependentMetadata,true);
 assert.equal(result.notAnOccupationalWageWithoutMetadata,true);
 assert.equal(result.automaticModelPromotion,false);
});
test('BLS refuses incompatible series IDs, unknown periods and unsupported windows',async()=>{
 await assert.rejects(()=>importBLSSeries({seriesId:'../../foo',startYear:2024,endYear:2025}),/Invalid/);
 await assert.rejects(()=>importBLSSeries({seriesId:'CEU0800000003',startYear:2000,endYear:2026}),/Invalid/);
 await assert.rejects(()=>importBLSSeries({seriesId:'CEU0800000003',startYear:2027,endYear:2027}),/Invalid/);
 const invalid={...BLS,Results:{series:[{...BLS.Results.series[0],seriesID:'WRONG'}]}};
 await assert.rejects(()=>importBLSSeries({seriesId:'CEU0800000003',startYear:2024,endYear:2025,
  fetchImpl:async()=>reader(invalid)}),/mismatch/);
 const badPeriod={...BLS,Results:{series:[{...BLS.Results.series[0],
  data:[{year:'2025',period:'M13',value:'9'}]}]}};
 await assert.rejects(()=>importBLSSeries({seriesId:'CEU0800000003',startYear:2024,endYear:2025,
  fetchImpl:async()=>reader(badPeriod)}),/schema/);
});
test('HTTP content type, errors and payload byte limits fail closed',async()=>{
 await assert.rejects(()=>importCBP2023({stateFips:'01',apiKey:'x'.repeat(40),
  fetchImpl:async()=>reader(CBP,{type:'text/html'})}),/MIME/);
 await assert.rejects(()=>importCBP2023({stateFips:'01',apiKey:'x'.repeat(40),
  fetchImpl:async()=>reader({error:'no key'},{status:403})}),/unavailable/);
 await assert.rejects(()=>importCBP2023({stateFips:'01',apiKey:'x'.repeat(40),
  fetchImpl:async()=>reader([{text:'x'.repeat(MAX_BYTES+128)}])}),/byte budget|too large/);
});
