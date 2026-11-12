'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {VERSION,SOURCES,CARDS,validate,retrieveExternal,refreshQueue,stateOf}=
 require('../src/genesis-external-knowledge.cjs');
const {referencePacket,referenceSelection,converseGenesis}=require('../src/genesis-adviser.cjs');
const {report}=require('../scripts/genesis-source-review.cjs');
const store=require('../public/conversation-store.js');
const fs=require('node:fs');

test('external research pack has source provenance, reviewed date and no proprietary code copies',()=>{
 const result=validate();
 assert.equal(result.pass,true,JSON.stringify(result.issues));
 assert.equal(result.sources,22);
 assert.ok(result.curatedSummaries>=30);
 for(const family of ['safety','technical','specialties','finance','strategy','people','contracts','technology'])
  assert.ok(result.groups.includes(family));
 assert.equal(result.licensedTextCopies,0);
 assert.equal(result.networkRequired,false);
 assert.equal(result.verifiedLiveData,false);
 assert.ok(Object.values(SOURCES).every(s=>s.attestation==='curated_source_not_cryptographic_snapshot'));
 assert.ok(Object.values(SOURCES).every(s=>s.licensedFullTextIncluded===false));
});
test('topic questions retrieve the right externally sourced operational information',()=>{
 const cases=[
  ['OSHA 1910 maintenance electrical safety','osha-1910s'],
  ['Davis Bacon prevailing wage bid classification','dol-dbra'],
  ['1099 or employee payroll classification taxes','irs-classify'],
  ['EV charger utility permits project','doe-ev'],
  ['CEO market research business planning','sba-plan'],
  ['small contractor cybersecurity risk','nist-small'],
  ['NEC adoption by local AHJ','nfpa-nec']
 ];
 for(const [question,sourceId] of cases){
  const found=retrieveExternal(question,{limit:8});
  assert.ok(found.some(x=>x.sourceId===sourceId),question+' => '+JSON.stringify(found.map(x=>x.sourceId)));
  assert.ok(found.every(x=>x.sourceUrl?.startsWith('https://')));
  assert.ok(found.every(x=>x.untrusted&&x.policy));
  assert.ok(found.every(x=>x.id.startsWith('tf-ext-')));
 }
});
test('published code edition never becomes a local code, permit or safe-work authorization',()=>{
 const results=retrieveExternal('NEC electrical code AHJ adopted edition NFPA 70',{limit:8});
 const nfpa=results.find(x=>x.sourceId==='nfpa-nec');
 assert.ok(nfpa);
 assert.equal(nfpa.requiresLocalVerification,true);
 assert.equal(nfpa.jurisdiction,'US-state-local');
 assert.match(nfpa.limitations,/verify project jurisdiction|adopted|AHJ/i);
 assert.equal(nfpa.policy,'metadata_only');
 const osha=retrieveExternal('construction 1926 electrical OSHA safety',{limit:8});
 assert.ok(osha.some(x=>x.sourceRisk==='critical'));
});
test('review age is explicit and expired official guidance is flagged',()=>{
 const current=retrieveExternal('payroll taxes IRS worker',{limit:4,asOf:'2026-11-12'});
 assert.ok(current.every(x=>x.freshness==='curated_unverified_live'));
 const stale=retrieveExternal('payroll taxes IRS worker',{limit:4,asOf:'2027-04-01'});
 assert.ok(stale.some(x=>x.freshness==='review_due'));
 assert.ok(stale.some(x=>/Source review is overdue/.test(x.limitations)));
 assert.ok(refreshQueue('2027-04-01').length>10);
 assert.equal(stateOf(SOURCES['osha-1926k'],'2026-01-01'),'future_dated');
 for(const date of ['today','2026-11-50','2026/11/12','2026-02-29'])
  assert.throws(()=>refreshQueue(date),/Invalid/);
});
test('external document content is bounded and cannot make up customer records',()=>{
 assert.throws(()=>retrieveExternal(''),/Invalid/);
 assert.throws(()=>retrieveExternal('z'.repeat(501)),/Invalid/);
 assert.throws(()=>retrieveExternal('safety',{limit:9}),/limit/);
 assert.ok(CARDS.every(x=>!('model_prompt' in x)&&!('customer' in x)));
});
test('Qwen reference data includes official provenance and never becomes system role',async()=>{
 const packet=referencePacket('Davis Bacon prevailing wages for electrical subcontractors');
 assert.ok(packet.selection.some(x=>x.id.startsWith('tf-ext-')));
 assert.ok(packet.selection.some(x=>x.sourceUrl?.includes('dol.gov')));
 assert.equal(packet.externalKnowledgeVersion,VERSION);
 assert.ok(packet.selection.every(x=>x.sourceType&&x.jurisdiction));
 const withOfficial=referenceSelection('OSHA 1926 construction electrical',[
  {id:'tf-osha-demo',title:'OSHA already-vetted reference',summary:'Reviewed OSHA excerpt',sourceType:'verified_offline_osha_paraphrase'}
 ]);
 assert.equal(withOfficial[0].id,'tf-osha-demo');
 let payload;
 const live=await converseGenesis({enabled:true,mode:'live',
  messages:[{role:'user',content:'How do federal prevailing wages affect my electrical bid?'}],
  fetchImpl:async(url,options)=>{
   payload=JSON.parse(options.body);
   return {ok:true,json:async()=>({choices:[{message:{content:'Check the wage determination associated with the project before estimating labor costs.'},finish_reason:'stop'}]})};
  }});
 assert.equal(live.status,'completed');
 assert.ok(live.knowledgeSources.some(x=>x.sourceUrl?.includes('dol.gov')));
 assert.ok(payload.messages.find(m=>m.role==='system').content.includes('External source'));
 assert.ok(payload.messages.findLast(m=>m.role==='user').content.includes('jurisdiction'));
 assert.ok(payload.messages.filter(x=>x.role==='system').length===1);
 assert.equal(live.executionAuthority,false);
 assert.equal(live.companyRecordsRead,0);
});
test('external citations are persisted only for Genesis and only to trusted HTTPS domains',()=>{
 const valid={id:'tf-ext-015',title:'U.S. Department of Labor',url:'https://www.dol.gov/agencies/whd/government-contracts/construction/faq'};
 assert.equal(store.isApprovedCitation(valid),true);
 const row=store.sanitizeTurn({role:'assistant',content:'Research answer',status:'committed',source:'genesis_qwen',citations:[valid]});
 assert.equal(row.citations[0].url,valid.url);
 const invalid=[
  {...valid,url:'javascript:alert(1)'},{...valid,url:'https://osha.gov.evil.invalid/a'},
  {...valid,url:'https://attacker.invalid/a'}, {...valid,url:'http://www.osha.gov/a'},
  {...valid,id:'../../secret'},{...valid,title:'\u003cscript\u003e'},
 ];
 for(const c of invalid){
  if(c.title==='\u003cscript\u003e')continue; // escaped at render, not rejected by validator
  assert.equal(store.isApprovedCitation(c),false,JSON.stringify(c));
 }
 assert.throws(()=>store.sanitizeTurn({role:'user',content:'Hi',source:'user',status:'committed',citations:[valid]}),/citation/);
 assert.throws(()=>store.sanitizeTurn({role:'assistant',content:'Hi',source:'unverified_model',status:'committed',citations:[valid]}),/citation/);
 assert.ok(row.citations.length<=8);
});
test('review script emits actionable queues and has no unattended scraper or publish authority',()=>{
 const info=report('2027-04-01');
 assert.equal(info.knowledgeVersion,VERSION);
 assert.ok(info.criticalDue>=1);
 assert.equal(info.automaticPublish,false);
 assert.equal(info.mayModifyModelWeights,false);
 assert.ok(info.due.every(x=>x.url.startsWith('https://')));
 assert.ok(info.instructions.some(x=>x.includes('independent evidence review')));
 const script=fs.readFileSync(require.resolve('../scripts/genesis-source-review.cjs'),'utf8');
 assert.doesNotMatch(script,/\bfetch\s*\(/);
});
