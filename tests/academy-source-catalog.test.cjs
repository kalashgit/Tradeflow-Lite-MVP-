'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const catalog=require('../data/knowledge/tradeflow-academy-sources.v1.json');
test('59 Academy source identifiers are complete, sequential and unique',()=>{
 assert.equal(catalog.schemaVersion,1);
 assert.equal(catalog.records.length,59);
 assert.equal(new Set(catalog.records.map(x=>x.sourceId)).size,59);
 catalog.records.forEach((r,i)=>{assert.equal(r.number,i+1);assert.equal(r.sourceId,'TF-MI-ACADEMY-01-'+String(i+1).padStart(3,'0'));assert.ok(r.title&&r.author&&r.learningObjective);assert.match(r.referenceUrl,/^https:\/\//);});
});
test('bibliographic metadata cannot be mistaken for ingested books or verified licenses',()=>{
 assert.equal(catalog.status,'reference_metadata_only_not_runtime_ingested');
 for(const r of catalog.records){assert.equal(r.recordKind,'source_catalog_metadata');assert.equal(r.ingestedContent,false);assert.equal(r.fullTextRightsVerified,false);}
});
test('exact source cohorts preserve the founder Academy availability distinctions',()=>{
 assert.equal(catalog.records.filter(x=>x.editorialMaterialAvailability==='paraphrased_study_guide_reported').length,19);
 assert.equal(catalog.records.filter(x=>x.editorialMaterialAvailability==='structured_notes_reported').length,20);
 assert.equal(catalog.records.filter(x=>x.editorialMaterialAvailability==='curriculum_metadata_only').length,20);
});
