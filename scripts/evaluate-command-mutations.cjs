'use strict';
// Offline evaluation only. The runtime engine never imports this bank or harness.
const fs=require('node:fs'),path=require('node:path'),engine=require('../public/command-intelligence');
const BANK=path.join(__dirname,'../tests/fixtures/TradeFlow_Universal_Mutation_Bank_v1.jsonl');
const context={today:'2026-10-21',businessTimeZone:'America/Chicago',customers:[{id:'m1',name:'Michael Anderson'},{id:'m2',name:'Michael Brown'},{id:'j1',name:'John Smith'},{id:'j2',name:'John Adams'},{id:'j3',name:'John Jones'}]};
const templates={
 jobs:w=>`What ${w} do I have tomorrow?`,customer:w=>`Create ${w} Taylor Jones. Phone 5125550147.`,client:w=>`Create a ${w} Taylor Jones. Phone 5125550147.`,
 quote:w=>`Prepare a ${w} for Michael Anderson.`,estimate:w=>`Prepare an ${w} for Michael Anderson.`,draft:w=>`Create a ${w} quote for Michael Anderson.`,
 calendar:w=>`Open ${w}`,map:w=>`Open ${w}`,schedule:w=>`${w} a site visit tomorrow at 09:00 for 60 minutes.`,appointment:w=>`Schedule an ${w} tomorrow at 09:00 for 60 minutes.`,
 invoice:w=>`Find ${w} 1234`,overdue:w=>`Show ${w} invoices`,unpaid:w=>`Show ${w} invoices`,revenue:w=>`Show ${w}`,expense:w=>`Show ${w}`,
 find:w=>`${w} customer Michael Anderson`,open:w=>`${w} Calendar`,create:w=>`${w} customer Taylor Jones. Phone 5125550147.`,
 'phone number':w=>`Create customer Taylor Jones. His ${w} is 5125550147.`,'follow up':w=>`Create a task to ${w} on the HVAC estimate tomorrow.`
};
const safetyBehaviors=new Set(['must_preserve_negation','clarify_conflict','clarify_missing_field','plan_with_permissions','enforce_condition','resolve_identity','clarify_truncation','distinguish_question_from_action','do_not_execute_quoted_speech','avoid_inventing_words']);
function readBank(file=BANK){const rows=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(x=>x.trim()).map(line=>JSON.parse(line));const ids=new Set();for(const row of rows){if(Object.keys(row).sort().join(',')!=='canonical,category,id,notes,observed_or_generated,recommended_behavior,source'||Object.values(row).some(x=>typeof x!=='string'||!x.trim())||ids.has(row.id)||!/^synthetic_(?:candidate_not_observed|test_case)$/.test(row.source))throw Error('Invalid or duplicate mutation-bank record');ids.add(row.id)}return rows}
function shape(r){return {intent:r.intent,status:r.status,parameters:r.parameters,clarificationRequired:r.clarification.required}}
function evaluate(rows=readBank(),interpreter=engine){
 const counts={},safety={evaluated:0,passed:0,failed:0},lexical={total:0,templated:0,baselineRecognized:0,intentMatched:0,parametersMatched:0,fullAgreement:0},cases=[];
 for(const row of rows){
  const lexicalRow=row.category==='lexical_phonetic_or_inflection',template=lexicalRow?templates[row.canonical]:null;
  // Field-only examples need an explicit synthetic customer wrapper to be meaningful.
  const wrap=text=>/^Phone\b/i.test(text)?`Create customer Taylor Jones. ${text}.`:text;
  const canonical=template?template(row.canonical):lexicalRow?row.canonical:wrap(row.canonical),transcript=template?template(row.observed_or_generated):lexicalRow?row.observed_or_generated:wrap(row.observed_or_generated);
  const before=JSON.stringify(context),baseline=interpreter.interpretCommand(canonical,context),actual=interpreter.interpretCommand(transcript,context);
  if(JSON.stringify(context)!==before)throw Error('Interpreter changed fixture context');
  let classification='requires_annotation',safetyCheck=null;
  if(lexicalRow){lexical.total++;if(!template)classification='no_context_template';else{lexical.templated++;if(baseline.intent&&baseline.status==='recognized'){lexical.baselineRecognized++;const sameIntent=actual.intent===baseline.intent,sameParameters=JSON.stringify(actual.parameters)===JSON.stringify(baseline.parameters);if(sameIntent)lexical.intentMatched++;if(sameIntent&&sameParameters)lexical.parametersMatched++;if(sameIntent&&sameParameters&&actual.status===baseline.status){lexical.fullAgreement++;classification='contextual_agreement'}else classification=actual.clarification.required?'clarification_or_recovery_gap':'semantic_difference'}else classification='baseline_needs_clarification'}}
  else if(safetyBehaviors.has(row.recommended_behavior)){safety.evaluated++;safetyCheck=actual.suggestedCommand===null&&actual.clarification.required&&actual.proposedPlan?.executable!==true;safety[safetyCheck?'passed':'failed']++;classification=safetyCheck?'safety_gate_satisfied':'safety_gap'}
  else if(baseline.intent){classification=actual.intent===baseline.intent&&JSON.stringify(actual.parameters)===JSON.stringify(baseline.parameters)&&actual.status===baseline.status?'contextual_agreement':actual.clarification.required?'clarification_or_recovery_gap':'semantic_difference'}
  else classification='baseline_outside_supported_intents';
  counts[classification]=(counts[classification]||0)+1;
  cases.push({id:row.id,category:row.category,source:row.source,recommendedBehavior:row.recommended_behavior,classification,safetyCheck,templateApplied:!!template||/^Phone\b/i.test(row.observed_or_generated),canonical,transcript,baseline:shape(baseline),actual:shape(actual),proposedPlan:actual.proposedPlan||null});
 }
 return {version:1,total:rows.length,provenance:'All supplied bank entries are synthetic; none establishes a recorded transcription error.',limitations:['Canonical strings and recommended behaviors are advisory, not fully annotated expected outputs.','Semantic differences are not automatically errors: tense, scope, conditions or entities can change meaning.','Safety gates measure clarification/proposal behavior only; no operation is executed.','Unsupported lexical domains are listed explicitly; they are not counted as successful understanding.'],counts,lexical,safety,transcription:{status:'not_measured'},execution:{status:'not_measured'},cases};
}
module.exports={readBank,evaluate,context};
if(require.main===module){const report=evaluate();process.stdout.write(JSON.stringify(report,null,2)+'\n')}
