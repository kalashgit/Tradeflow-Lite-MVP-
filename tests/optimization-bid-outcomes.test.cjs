'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8'),ui=fs.readFileSync('public/opportunity-dossier.js','utf8');
test('opportunity workflow records documented win/loss reasons without inferred explanations',()=>{
 const window={};vm.runInNewContext(ui,{window,URL,Number,Array,Object}, {timeout:3000});
 const model=window.TradeFlowDossier;
 const form=model.workflow({id:'o1',project_name:'Panel replacement',status:'Lost',bid_outcome_reason:'Not shared',bid_outcome_notes:'Client did not disclose decision criteria.'},{settings:[]});
 assert.ok(form.includes('name="bid_outcome_reason"'));assert.ok(form.includes('name="bid_outcome_notes"'));
 assert.ok(form.includes('Reason not provided'));
 assert.ok(model.dossier({id:'o1',status:'Lost',bid_outcome_reason:'Not shared'}).includes('Recorded outcome reason'));
});
test('outcome cause requires an actual won/lost status and does not allow invented unspecified other cause',()=>{
 assert.ok(app.includes("!['Won','Lost'].includes(status)&&outcomeReason"));
 assert.ok(app.includes("outcomeReason==='Other'&&outcomeNotes.length<12"));
 assert.ok(app.includes('bid_outcome_reason:outcomeReason,bid_outcome_notes:outcomeNotes'));
});
