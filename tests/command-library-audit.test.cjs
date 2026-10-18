'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {readLibrary,evaluate}=require('../scripts/evaluate-command-library.cjs'),intelligence=require('../public/command-intelligence');
test('supplied library preserves 361 unique advisory entries and its exact source hash',()=>{
 const data=readLibrary();assert.equal(data.records.length,361);assert.equal(new Set(data.records.map(r=>r.id)).size,361);assert.equal(data.sha256,'b367794445c15e703efff84199728a90dc9f77336baac6e46d65658469128d6e');assert.equal(new Set(data.records.map(r=>r.page)).size,20);assert.deepEqual(data.excluded,['Optimization','Communication','Automation','Data Intelligence']);
 assert.ok(data.records.some(r=>r.implementation_status==='needs_capability_mapping_and_testing'));
});
test('every library row receives a coverage audit without any execution claim',()=>{
 const r=evaluate();assert.equal(r.total,361);assert.equal(r.cases.length,361);assert.equal(Object.values(r.counts).reduce((a,b)=>a+b,0),361);assert.equal(r.operations.navigate,229);assert.equal(r.operations.read,81);assert.equal(r.operations.draft,48);assert.equal(r.operations.create,2);assert.equal(r.operations.modify,1);assert.ok(r.cases.every(c=>c.executionVerified===false));assert.equal(r.transcription.status,'not_measured');assert.equal(r.execution.status,'not_measured');
 assert.equal(r.counts.navigation_needs_clarification_or_mapping||0,0);assert.ok(r.counts.no_registered_interpretation>0);
});
test('library labels never authorize missing capabilities, bulk creation or quotation conversion',()=>{
 for(const text of ['Add two customers: Michael Anderson and Sarah Jones','Convert accepted quote 102 into a job']){const r=intelligence.interpretCommand(text,{customers:[]});assert.equal(r.suggestedCommand,null);assert.notEqual(r.status,'recognized')}
 for(const file of ['public/speech-mutation-engine.js','public/command-intelligence.js']){const text=fs.readFileSync(file,'utf8');assert.ok(!text.includes('TFVC-'));assert.ok(!text.includes('Master_Voice_Command_Library'))}
});
test('registered navigation targets are checked without claiming their rendered pages work',()=>{
 const r=evaluate(),known=r.cases.filter(c=>c.expectedWorkspace);assert.equal(new Set(known.map(c=>c.expectedWorkspace)).size,20);assert.ok(known.every(c=>c.workspaceRegistered));assert.ok(known.some(c=>c.classification==='navigation_interpretation_matches_declared_target'));assert.ok(known.every(c=>!c.executionVerified));
});
