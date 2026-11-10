'use strict';
// Deterministic research control. Hidden mechanisms are supplied ONLY to the evaluator;
// candidates, observations and the intervention policy never receive a future observation.
const OPS=Object.freeze(['and','or','xor']);
function validateVariables(variables){
 if(!Array.isArray(variables)||variables.length<3||variables.length>4||new Set(variables).size!==variables.length||variables.some(v=>!['A','B','C','D'].includes(v)))throw Error('Invalid variables');
 return variables;
}
function statesFor(variables){
 validateVariables(variables);
 return Array.from({length:2**variables.length},(_,n)=>Object.fromEntries(variables.map((v,i)=>[v,(n>>(variables.length-1-i))&1])));
}
function candidatesFor(variables){
 validateVariables(variables);
 const pairs=[];
 for(let i=0;i<variables.length;i++)for(let j=i+1;j<variables.length;j++)pairs.push([variables[i],variables[j]]);
 return OPS.flatMap(op=>pairs.map(inputs=>({op,inputs:[...inputs]})));
}
function evaluateRule(rule,state,variables){
 validateVariables(variables);
 if(!rule||!OPS.includes(rule.op)||!Array.isArray(rule.inputs)||rule.inputs.length!==2||new Set(rule.inputs).size!==2||rule.inputs.some(v=>!variables.includes(v)))throw Error('Invalid candidate rule');
 if(variables.some(v=>state?.[v]!==0&&state?.[v]!==1))throw Error('Invalid observation state');
 const [a,b]=rule.inputs.map(k=>state[k]);
 return rule.op==='and'?(a&b):rule.op==='or'?(a|b):(a^b);
}
function ruleId(rule){return rule.op+'('+[...rule.inputs].sort().join(',')+')';}
function stateId(state,variables){return variables.map(v=>state[v]).join('');}
function consistentRules(observations,variables,candidates=candidatesFor(variables)){
 return candidates.filter(rule=>observations.every(o=>evaluateRule(rule,o.state,variables)===o.result));
}
function activeChoice(observations,variables){
 const seen=new Set(observations.map(o=>stateId(o.state,variables)));
 const possible=consistentRules(observations,variables);
 if(possible.length===0)throw Error('Unsupported or contradictory observations');
 const options=statesFor(variables).filter(s=>!seen.has(stateId(s,variables)));
 options.sort((a,b)=>{
  const yesA=possible.filter(r=>evaluateRule(r,a,variables)===1).length;
  const yesB=possible.filter(r=>evaluateRule(r,b,variables)===1).length;
  const scoreA=yesA*(possible.length-yesA),scoreB=yesB*(possible.length-yesB);
  return scoreB-scoreA||stateId(a,variables).localeCompare(stateId(b,variables));
 });
 return options[0]||null;
}
function shuffledStates(variables,seed){
 const values=statesFor(variables);
 let state=seed>>>0;
 function next(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;}
 for(let i=values.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
 return values;
}
function identifyRule(trueRule,{variables=['A','B','C'],policy='active',seed=17,initial=[]}={}){
 if(!['active','fixed','random'].includes(policy))throw Error('Invalid intervention policy');
 const history=initial.map(o=>({state:{...o.state},result:o.result}));
 const ordering=policy==='random'?shuffledStates(variables,seed):statesFor(variables);
 let remaining=consistentRules(history,variables),newExperiments=0;
 while(remaining.length>1&&history.length<2**variables.length){
  const used=new Set(history.map(o=>stateId(o.state,variables)));
  const next=policy==='active'?activeChoice(history,variables):ordering.find(s=>!used.has(stateId(s,variables)));
  if(!next)break;
  const measurement={state:{...next},result:evaluateRule(trueRule,next,variables)};
  history.push(measurement);
  newExperiments++;
  remaining=consistentRules(history,variables);
 }
 return {identified:remaining.length===1&&ruleId(remaining[0])===ruleId(trueRule),experiments:newExperiments,remaining:remaining.length,history};
}
function discoverDrift(previousRule,currentRule,variables=['A','B','C']){
 // The detector is not informed of a change point or the new true rule.
 // It sees predictions from the established rule and incoming observed outcomes.
 const states=statesFor(variables);
 let falseAlarms=0;
 for(const state of states)if(evaluateRule(previousRule,state,variables)!==evaluateRule(previousRule,state,variables))falseAlarms++;
 let detection=null,firstMeasurement=null;
 for(let i=0;i<states.length;i++){
  const state=states[i],observed=evaluateRule(currentRule,state,variables);
  if(evaluateRule(previousRule,state,variables)!==observed){
   detection=i+1;firstMeasurement={state:{...state},result:observed};break;
  }
 }
 if(detection===null)return {detected:false,detectionDelay:null,recovered:false,falseAlarms,postChangeExperiments:0};
 const recovered=identifyRule(currentRule,{variables,policy:'active',initial:[firstMeasurement]});
 return {detected:true,detectionDelay:detection,recovered:recovered.identified,falseAlarms,postChangeExperiments:1+recovered.experiments};
}
function mean(xs){return xs.reduce((a,b)=>a+b,0)/xs.length;}
function reportFor(variables){
 const rules=candidatesFor(variables);
 const active=rules.map(r=>identifyRule(r,{variables,policy:'active'}));
 const fixed=rules.map(r=>identifyRule(r,{variables,policy:'fixed'}));
 const random=[17,41,99].flatMap(seed=>rules.map(r=>identifyRule(r,{variables,policy:'random',seed})));
 return {variables:[...variables],ruleCount:rules.length,active:{identified:active.filter(x=>x.identified).length,meanExperiments:+mean(active.map(x=>x.experiments)).toFixed(4),maxExperiments:Math.max(...active.map(x=>x.experiments))},fixed:{identified:fixed.filter(x=>x.identified).length,meanExperiments:+mean(fixed.map(x=>x.experiments)).toFixed(4)},random:{trials:random.length,identified:random.filter(x=>x.identified).length,meanExperiments:+mean(random.map(x=>x.experiments)).toFixed(4)}};
}
function runResearchGates(){
 const core=reportFor(['A','B','C']);
 const heldOut=reportFor(['A','B','C','D']);
 const rules=candidatesFor(['A','B','C']);
 const shifts=rules.flatMap(prior=>rules.filter(next=>ruleId(next)!==ruleId(prior)).map(next=>discoverDrift(prior,next)));
 const drift={orderedTransitions:shifts.length,detected:shifts.filter(s=>s.detected).length,recovered:shifts.filter(s=>s.recovered).length,falseAlarms:shifts.reduce((sum,s)=>sum+s.falseAlarms,0),meanDetectionDelay:+mean(shifts.map(s=>s.detectionDelay)).toFixed(4),meanRecoveryExperiments:+mean(shifts.map(s=>s.postChangeExperiments)).toFixed(4),maxDetectionDelay:Math.max(...shifts.map(s=>s.detectionDelay))};
 const passed=[core,heldOut].every(g=>g.active.identified===g.ruleCount&&g.fixed.identified===g.ruleCount&&g.active.meanExperiments<g.fixed.meanExperiments)&&drift.detected===drift.orderedTransitions&&drift.recovered===drift.orderedTransitions&&drift.falseAlarms===0;
 return {kind:'deterministic-controller-gates',realModelInference:false,persistentMemoryEnabled:false,passed,core,heldOutFourSwitch:heldOut,drift,limitations:['Oracle-known Boolean rule grammar, no observational noise','Held-out variable count tests controller transfer, NOT Qwen or new causal operator discovery','Change detection uses truth-table interventions and known previous rule, not a learned drift policy','No evidence of model-weight improvement or real-world scientific discovery']};
}
module.exports={statesFor,candidatesFor,evaluateRule,consistentRules,activeChoice,identifyRule,discoverDrift,runResearchGates};
