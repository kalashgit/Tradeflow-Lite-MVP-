'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {audit,SOURCES,RECORDS,SERIES,retrieveIndustry,historicalSeries,
 competitorMatrix,VERSION}=require('../src/genesis-industry-intelligence.cjs');
const {referenceSelection,referencePacket,converseGenesis}=require('../src/genesis-adviser.cjs');
const store=require('../public/conversation-store.js');
const {createPreviewServer}=require('../scripts/local-ai-preview-server.cjs');

test('research catalog includes public economic datasets, labor, code, producers, contracts and competitors',()=>{
 const a=audit();
 assert.equal(a.pass,true,JSON.stringify(a.errors));
 assert.ok(a.sources>=30,JSON.stringify(a));
 assert.ok(a.notes>=30,JSON.stringify(a));
 for(const topic of ['market_history','labor_history','material_history','manufacturer',
  'software_competitor','jurisdiction','contracts','estimating','supplier_catalog'])
  assert.ok(a.categories[topic]>=1,topic);
 assert.equal(a.historicalSeries,1);
 assert.equal(a.historicalObservations,5);
 assert.equal(a.disclosedPrivateData,0);
 assert.equal(a.trainingWeightsUpdated,false);
 assert.match(VERSION,/AIONIndustryIntelligence/);
 assert.ok(Object.values(SOURCES).every(x=>x.fullLicensedText===false));
});
test('verified historical observation snapshots retain series, periods, index units and data provenance',()=>{
 const s=historicalSeries('WPU102603');
 assert.equal(s.unit,'Index Dec 1982 = 100');
 assert.equal(s.observations.length,5);
 assert.deepEqual(s.observations.map(x=>x.period),['2026-05','2026-06','2026-07','2026-08','2026-09']);
 assert.equal(s.observations.at(-1).value,497.992);
 assert.equal(historicalSeries('WPU102603',{from:'2026-07',to:'2026-08'}).observations.length,2);
 assert.throws(()=>historicalSeries('unknown'),/Unknown/);
 assert.throws(()=>historicalSeries('WPU102603',{from:'2027-13'}),/Invalid/);
 assert.throws(()=>historicalSeries('WPU102603',{from:'2026-09',to:'2026-05'}),/Invalid/);
 const hits=retrieveIndustry('Has the wire cable copper PPI material price changed?');
 assert.ok(hits.some(x=>x.id==='tf-industry-historical-WPU102603'));
 const actual=hits.find(x=>x.id==='tf-industry-historical-WPU102603');
 assert.ok(actual.summary.includes('2026-09: 497.992'));
 assert.match(actual.limitations,/NOT a supplier quote/);
});
test('vendor comparisons never convert advertising into independent outcomes or missing-feature verdicts',()=>{
 const data=competitorMatrix({vendors:['servicetitan','simpro','buildops']});
 assert.equal(data.rows.length,3);
 assert.equal(data.rows[0].evidenceClass,'vendor_feature_claim');
 assert.equal(data.rows[0].capabilities.pricebooks,'publicly_advertised');
 assert.equal(data.rows[2].capabilities.pricebooks,'not_checked');
 assert.match(data.disclaimer,/not yet checked/);
 assert.ok(data.rows.every(x=>x.sourceUrl?.startsWith('https://')));
 assert.throws(()=>competitorMatrix({vendors:['fake_company']}),/Invalid/);
 assert.throws(()=>competitorMatrix({vendors:[]}),/Invalid/);
 assert.throws(()=>competitorMatrix({vendors:Array(9).fill('servicetitan')}),/Invalid/);
});
test('jurisdiction notes preserve actual dates and conflict with stale official source',()=>{
 const texas=retrieveIndustry('Texas NEC 2026 2023 code compliance guide conflict',{limit:8});
 assert.ok(texas.some(x=>x.sourceId==='texas-rule'));
 assert.ok(texas.some(x=>x.sourceId==='texas-guide'));
 assert.ok(texas.every(x=>x.actionAuthority===false));
 const washington=retrieveIndustry('Washington WAC December 31 NEC 2026 future effective date',{limit:8});
 assert.ok(washington.some(x=>x.sourceId==='washington-rule'));
 assert.ok(washington.some(x=>x.requiresLocalVerification));
});
test('supplier categories cannot be advertised as live prices or approved installation parts',()=>{
 const parts=retrieveIndustry('Southwire copper wire price list supplier quote manufacturer catalog',{limit:8});
 assert.ok(parts.some(x=>x.sourceId==='southwire-catalog'));
 assert.ok(parts.some(x=>x.sourceId==='southwire-market'));
 assert.ok(parts.some(x=>/not a verified dealer quote|not an approved SKU/i.test(x.limitations)));
 assert.ok(retrieveIndustry('Wesco wire cable electrical supplier',{limit:8}).some(x=>x.sourceId==='wesco-distribution'));
 assert.ok(retrieveIndustry('NECA 2025 2027 labor unit estimating',{limit:8}).some(x=>x.sourceId==='neca-labor'));
 assert.throws(()=>retrieveIndustry('supplier',{limit:9}),/Invalid/);
 assert.throws(()=>retrieveIndustry(''),/Invalid/);
});
test('TradeFlow Qwen reference packet contains sourced history and competitor claims, not permission to execute',async()=>{
 const prompt='How did copper wire PPI costs change in 2026?';
 const packet=referencePacket(prompt);
 assert.equal(packet.industryKnowledgeVersion,VERSION);
 assert.ok(packet.selection.some(x=>x.id.startsWith('tf-industry-')));
 assert.ok(packet.selection.some(x=>x.sourceUrl?.includes('fred.stlouisfed.org')));
 let input;
 const result=await converseGenesis({enabled:true,mode:'live',messages:[{role:'user',content:prompt}],
  fetchImpl:async(url,opts)=>{
   input=JSON.parse(opts.body);
   return {ok:true,json:async()=>({choices:[{message:{content:'The wire-and-cable price index rose over the observed months, but it is not a quote for your next job.'},finish_reason:'stop'}]})};
  }});
 assert.equal(result.source,'genesis_qwen');
 assert.equal(result.executionAuthority,false);
 assert.equal(result.companyRecordsRead,0);
 assert.equal(result.industryKnowledgeVersion,VERSION);
 assert.ok(result.knowledgeSources.some(x=>x.sourceUrl?.includes('fred.stlouisfed.org')));
 assert.ok(input.messages.find(x=>x.role==='system').content.includes('vendor claims'));
 assert.equal(input.messages.filter(x=>x.role==='system').length,1);
 assert.ok(input.messages.findLast(x=>x.role==='user').content.includes('2026-09'));
});
test('new source links require exact allowlisted HTTPS hosts and remain external citations, not account evidence',()=>{
 const approved=[
  {id:'tf-industry-fred-copper',title:'FRED PPI',url:'https://fred.stlouisfed.org/series/WPU102603'},
  {id:'tf-industry-housecallpro-capabilities',title:'Housecall Pro',url:'https://www.housecallpro.com/industries/electrical-contractor-software/'},
  {id:'tf-industry-texas-2026',title:'TDLR',url:'https://www.tdlr.texas.gov/news/rulemaking/2026/09/01/commission-adopts-rules-12/'},
 ];
 for(const item of approved)assert.equal(store.isApprovedCitation(item),true,JSON.stringify(item));
 const saved=store.sanitizeTurn({role:'assistant',content:'Research-only advisory with sources',
  source:'genesis_qwen',status:'committed',citations:approved});
 assert.equal(saved.citations.length,3);
 for(const item of [
  {...approved[0],url:'javascript:alert(1)'},{...approved[0],url:'https://fred.stlouisfed.org.evil.example/path'},
  {...approved[0],url:'https://evil.example/series/WPU102603'}
 ])assert.equal(store.isApprovedCitation(item),false,JSON.stringify(item));
 assert.throws(()=>store.sanitizeTurn({role:'assistant',content:'fake',source:'unverified_model',status:'committed',citations:approved}),/citation/);
});
test('preview health declares catalog coverage without live research or real tenant reads',async()=>{
 const server=createPreviewServer({secret:'synthetic-research-secret',mode:'mock'}).server;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const port=server.address().port;
  const response=await fetch('http://127.0.0.1:'+port+'/api/ai/health');
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.genesisPilot,true);
  assert.equal(body.genesisIndustryIntelligence.historicalObservations,5);
  assert.ok(body.genesisIndustryIntelligence.sources>=30);
  assert.equal(body.genesisIndustryIntelligence.trainingWeightsUpdated,false);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
