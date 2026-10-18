'use strict';
// Capability/interpretation audit only. No runtime creation, approval or execution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const intelligence=require('../public/command-intelligence'),registry=require('../public/command-registry');
const FILE=path.join(__dirname,'../tests/fixtures/TradeFlow_Master_Voice_Command_Library_v1.json');
function readLibrary(file=FILE){const text=fs.readFileSync(file,'utf8'),data=JSON.parse(text);if(data.version!==1||!Array.isArray(data.records)||!Array.isArray(data.excluded))throw Error('Unsupported library format');const ids=new Set();for(const row of data.records){if(!row||['id','section','page','priority','operation','utterance','registry_command','implementation_status','notes'].some(k=>typeof row[k]!=='string'||!row[k])||ids.has(row.id))throw Error('Invalid or duplicate library row');ids.add(row.id)}return {...data,sha256:crypto.createHash('sha256').update(text).digest('hex')}}
function evaluate(data=readLibrary()){
 const counts={},operations={},cases=[],context={today:'2026-10-21',businessTimeZone:'America/Chicago',customers:[]};
 for(const row of data.records){const expectedWorkspace=row.notes.match(/\bworkspace=([a-z_-]+)/i)?.[1]||null,result=intelligence.interpretCommand(row.utterance,{...context,sourcePage:row.page}),parsed=registry.parse(row.utterance);let classification;
  const workspaceEvidence=expectedWorkspace?registry.resolve({commandId:'workspace.open',params:{workspace:expectedWorkspace}},{},context):null;
  if(row.operation==='navigate'&&expectedWorkspace)classification=result.intent==='workspace.open'&&result.parameters.workspace===expectedWorkspace&&result.status==='recognized'?'navigation_interpretation_matches_declared_target':result.clarification.required?'navigation_needs_clarification_or_mapping':'navigation_target_mismatch';
  else classification=!result.intent?'no_registered_interpretation':result.clarification.required?'candidate_needs_review_or_parameters':'interpretation_only_operation_mapping_unverified';
  counts[classification]=(counts[classification]||0)+1;operations[row.operation]=(operations[row.operation]||0)+1;
  cases.push({id:row.id,page:row.page,operation:row.operation,utterance:row.utterance,declaredStatus:row.implementation_status,declaredRegistryCommand:row.registry_command,expectedWorkspace,workspaceRegistered:workspaceEvidence?.status==='ready',classification,actual:{intent:result.intent,status:result.status,effect:result.effect,parameters:result.parameters,clarification:result.clarification},registryParse:{status:parsed.status,commandId:parsed.commandId||null,params:parsed.params||null},executionVerified:false});
 }
 return {version:1,total:data.records.length,sourceBranch:data.source_branch,sourceSha256:data.sha256,excluded:data.excluded,operations,counts,limitations:['Source labels explicitly include unverified phrases and desired capabilities; they are not proof of implementation.','Matching a navigation target establishes interpretation only, not a working rendered workspace.','Registry parse/resolve calls are pure validation; no runtime, approval, execution, UI or database was invoked.','Operation rows lack full parameter expectations and authoritative records; they are coverage, not accuracy fixtures.','Unverified library notes are not installed as runtime aliases or execution permissions.'],transcription:{status:'not_measured'},execution:{status:'not_measured'},cases};
}
module.exports={readLibrary,evaluate};
if(require.main===module)process.stdout.write(JSON.stringify(evaluate(),null,2)+'\n');
