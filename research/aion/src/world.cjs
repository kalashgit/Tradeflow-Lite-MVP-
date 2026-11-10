'use strict';
// Hidden rules exist only in the evaluator; the model receives observations, not this file.
const SWITCHES=Object.freeze(['A','B','C']);
const OPS=Object.freeze(['and','or','xor']);
const PAIRS=Object.freeze([['A','B'],['A','C'],['B','C']]);
const CANDIDATES=Object.freeze(OPS.flatMap(op=>PAIRS.map(pair=>Object.freeze({op,inputs:Object.freeze([...pair])}))));
const INPUTS=Object.freeze(Array.from({length:8},(_,n)=>Object.freeze({A:(n>>2)&1,B:(n>>1)&1,C:n&1})));
function normalizeRule(rule){
 if(!rule||!OPS.includes(rule.op)||!Array.isArray(rule.inputs)||rule.inputs.length!==2||rule.inputs.some(x=>!SWITCHES.includes(x))||rule.inputs[0]===rule.inputs[1])throw Error('Invalid causal rule');
 return {op:rule.op,inputs:[...rule.inputs].sort()};
}
function prediction(rule,state){
 const r=normalizeRule(rule);
 if(!state||SWITCHES.some(k=>state[k]!==0&&state[k]!==1))throw Error('Invalid switch state');
 const [x,y]=r.inputs.map(k=>state[k]);
 return r.op==='and'?(x&y):r.op==='or'?(x|y):(x^y);
}
function observationsFor(rule,states){return states.map(state=>({state:{...state},result:prediction(rule,state)}));}
function consistentCandidates(observations){
 return CANDIDATES.filter(rule=>observations.every(o=>prediction(rule,o.state)===o.result));
}
function key(state){return SWITCHES.map(x=>state[x]).join('');}
function nextExperiment(observations){
 const seen=new Set(observations.map(o=>key(o.state)));
 const candidates=consistentCandidates(observations);
 if(!candidates.length)throw Error('Contradictory observations: no supported causal model');
 const untested=INPUTS.filter(state=>!seen.has(key(state)));
 if(!untested.length)return null;
 // Binary outcome: maximize disagreement across surviving explanations.
 const scored=untested.map(state=>{
  const yes=candidates.filter(r=>prediction(r,state)===1).length;
  return {state,score:yes*(candidates.length-yes)};
 });
 scored.sort((a,b)=>b.score-a.score||key(a.state).localeCompare(key(b.state)));
 return scored[0].state;
}
function ruleKey(rule){const r=normalizeRule(rule);return r.op+'('+r.inputs.join(',')+')';}
function experimentWorlds(){return [
 {id:'door-control',initial:{op:'and',inputs:['A','B']},changed:{op:'xor',inputs:['A','B']}},
 {id:'power-relay',initial:{op:'xor',inputs:['A','C']},changed:{op:'or',inputs:['A','C']}},
 {id:'alarm-circuit',initial:{op:'or',inputs:['B','C']},changed:{op:'and',inputs:['B','C']}}
];}
module.exports={SWITCHES,OPS,CANDIDATES,INPUTS,normalizeRule,prediction,consistentCandidates,nextExperiment,ruleKey,experimentWorlds,key};
