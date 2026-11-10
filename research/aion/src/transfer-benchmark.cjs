'use strict';
// Held-out expanded-variable benchmark. Causal rule family is the SAME pairwise
// Boolean grammar; only switch count and causal pair are new. Not proof of novel-rule transfer.
const {statesFor,consistentRules,activeChoice,evaluateRule,candidatesFor}=require('./research-gates.cjs');
const VARIABLES=Object.freeze(['A','B','C','D']);
const WORLDS=Object.freeze([
 {id:'relay-AD',initial:{op:'and',inputs:['A','D']},changed:{op:'xor',inputs:['A','D']}},
 {id:'sensor-BD',initial:{op:'xor',inputs:['B','D']},changed:{op:'or',inputs:['B','D']}},
 {id:'actuator-CD',initial:{op:'or',inputs:['C','D']},changed:{op:'and',inputs:['C','D']}}
]);
function truthAccuracy(proposal,hiddenRule){
 if(!proposal)return 0;
 const states=statesFor(VARIABLES);
 return states.filter(state=>evaluateRule(proposal,state,VARIABLES)===evaluateRule(hiddenRule,state,VARIABLES)).length/states.length;
}
async function phase(provider,hiddenRule,{previousRule=null,maxExperiments=6}={}){
 const history=[],trace=[];
 let last=previousRule,modelCalls=0,repairAttempts=0,invalidOutputCount=0,revisions=0;
 for(let step=0;step<maxExperiments;step++){
  const state=activeChoice(history,VARIABLES);
  if(!state)break;
  const observation={state:{...state},result:evaluateRule(hiddenRule,state,VARIABLES)};
  history.push(observation);
  const out=await provider.infer({observations:structuredClone(history),previousRule:last,allowedSwitches:VARIABLES});
  modelCalls+=out.modelCalls??1;
  repairAttempts+=out.repairAttempts??0;
  invalidOutputCount+=out.invalidOutputKind?1:0;
  const oldId=last?last.op+'('+last.inputs.join(',')+')':null;
  last=out.rule||null;
  const newId=last?last.op+'('+last.inputs.join(',')+')':null;
  if(oldId&&newId&&oldId!==newId)revisions++;
  const consistency=!!last&&consistentRules(history,VARIABLES).some(r=>r.op===last.op&&r.inputs.join(',')===last.inputs.join(','));
  trace.push({step:step+1,observed:observation,proposed:newId,consistent:consistency,truthTableAccuracy:truthAccuracy(last,hiddenRule),modelCalls:out.modelCalls??1,...(out.invalidOutputKind?{invalidOutputKind:out.invalidOutputKind}:{})});
 }
 return {experiments:trace.length,truthTableAccuracy:truthAccuracy(last,hiddenRule),modelCalls,repairAttempts,invalidOutputCount,revisions,consistentProposals:trace.filter(t=>t.consistent).length,trace,finalHypothesis:last};
}
async function runTransferBenchmark(provider,{maxExperiments=6}={}){
 if(!provider||typeof provider.infer!=='function')throw Error('Provider is required');
 if(!Number.isInteger(maxExperiments)||maxExperiments<2||maxExperiments>16)throw Error('Invalid transfer experiment budget');
 const scenarios=[];
 for(const world of WORLDS){
  const initial=await phase(provider,world.initial,{maxExperiments});
  const changed=await phase(provider,world.changed,{previousRule:initial.finalHypothesis,maxExperiments});
  scenarios.push({world:world.id,initial,changed});
 }
 const phases=scenarios.flatMap(s=>[s.initial,s.changed]);
 const observations=phases.reduce((n,p)=>n+p.experiments,0);
 return {summary:{kind:'heldout-four-switch-pairwise',provider:provider.kind||'unknown',worlds:scenarios.length,phases:phases.length,observations,meanTruthTableAccuracy:+(phases.reduce((n,p)=>n+p.truthTableAccuracy,0)/phases.length).toFixed(4),hypothesisConsistencyRate:+(phases.reduce((n,p)=>n+p.consistentProposals,0)/observations).toFixed(4),modelCalls:phases.reduce((n,p)=>n+p.modelCalls,0),repairAttempts:phases.reduce((n,p)=>n+p.repairAttempts,0),invalidOutputCount:phases.reduce((n,p)=>n+p.invalidOutputCount,0),realModelInference:provider.kind==='live-qwen',memoryEnabled:false,operatorGeneralization:false},scenarios};
}
module.exports={VARIABLES,WORLDS,truthAccuracy,runTransferBenchmark};
