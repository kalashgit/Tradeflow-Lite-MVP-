'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const r=require('../data/knowledge/us-electrical-contractor-references.v1.json');
test('electrical specialist registry only references checked official or authoritative source pages',()=>{
 assert.equal(r.schemaVersion,1);assert.equal(r.sources.length,8);
 assert.equal(new Set(r.sources.map(x=>x.sourceId)).size,8);
 for(const x of r.sources){assert.match(x.sourceUrl,/^https:\/\//);assert.ok(x.publisher);assert.ok(x.jurisdiction);assert.ok(x.informationRole);assert.equal(x.sourceContentIngested,false);assert.equal(x.usableForComplianceDetermination,false);}
});
test('current NEC publication is not confused with local adoption',()=>{
 const nfpa=r.sources.find(x=>x.sourceId==='US-NFPA-70');const texas=r.sources.find(x=>x.sourceId==='TX-TDLR-NEC-2026');const austin=r.sources.find(x=>x.sourceId==='TX-AUSTIN-TECHNICAL-CODES');
 assert.match(nfpa.jurisdiction,/local adoption/);assert.match(texas.jurisdiction,/exceptions/);assert.match(austin.jurisdiction,/verify/);
 assert.match(r.safetyPolicy,/authority having jurisdiction/);
});
