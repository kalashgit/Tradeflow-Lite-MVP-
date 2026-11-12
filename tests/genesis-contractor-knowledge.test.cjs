'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {retrieve,catalog,SOURCES,VERSION}=require('../src/genesis-contractor-knowledge.cjs');

test('electrical contractor knowledge has broad typed coverage and source lineage',()=>{
 const info=catalog();
 assert.match(VERSION,/electrical-ceo-reference/);
 assert.ok(info.entries>=45,'At least a 45-topic initial curated seed');
 for(const group of ['ceo','sales','estimating','finance','operations','people','compliance','systems'])
  assert.ok(info.byFamily[group]>=3,group);
 assert.ok(info.sources>=7);
 assert.equal(info.status,'curated_seed_not_comprehensive_or_self_training');
});
test('estimating and profitability questions retrieve relevant practical notes',()=>{
 const quote=retrieve('How do I quote and estimate an electrical service call?',{limit:5});
 assert.ok(quote.some(x=>x.family==='estimating'));
 assert.ok(quote.some(x=>/service|estimate/i.test(x.title)));
 const margin=retrieve('How can our CEO improve profit margin and cash flow?',{limit:8});
 assert.ok(margin.some(x=>x.family==='finance'));
 assert.ok(margin.every(x=>x.id.startsWith('tf-')));
});
test('OSHA and adopted NEC questions retain authoritative source metadata and applicability caveat',()=>{
 const osha=retrieve('OSHA electrical safety construction lockout tagout circuits',{limit:8});
 assert.ok(osha.some(x=>x.sourceUrl?.startsWith('https://www.osha.gov/')));
 const nec=retrieve('Which NEC 2026 electrical code permits does my AHJ use?',{limit:8});
 assert.ok(nec.some(x=>x.sourceUrl?.startsWith('https://www.nfpa.org/')));
 assert.ok(nec.some(x=>/jurisdiction|adopted|local/i.test(x.limitations)));
 assert.match(SOURCES.nec.reliability,/not_proof_of_local_adoption/);
});
test('catalog does not pretend official copyrighted standards were copied as a full book',()=>{
 const info=catalog();
 assert.ok(info.entries<200);
 assert.ok(Object.values(SOURCES).every(s=>s.kind!=='full_code_text'));
 assert.ok(Object.values(SOURCES).filter(s=>s.url).every(s=>s.url.startsWith('https://')));
 assert.equal(info.reviewedOn,'2026-11-12');
});
test('search cannot exhaustively dump the pack or run commands',()=>{
 assert.throws(()=>retrieve('',{}),/Invalid/);
 assert.throws(()=>retrieve('a'.repeat(6001)),/Invalid/);
 assert.throws(()=>retrieve('cash',{limit:999}),/bound/);
 assert.ok(retrieve('unknown foobar cryptology',{limit:2}).length<=2);
});
