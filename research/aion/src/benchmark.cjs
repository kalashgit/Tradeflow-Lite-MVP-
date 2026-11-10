'use strict';
const {INPUTS,prediction,nextExperiment,consistentCandidates,ruleKey,experimentWorlds}=require('./world.cjs');
function accuracy(rule,trueRule){return INPUTS.filter(state=>prediction(rule,state)===prediction(trueRule,state)).length/INPUTS.length;}
async function runPhase({provider,hiddenRule,previousRule=null,maxExperiments=5}){
 let observations=[],hypothesis=previousRule,trace=[],revisions=0,invalidHypotheses=0;
 for(let step=0;step<maxExperiments;step++){
  const state=nextExperiment(observations);
  if(!state)break;
  const observation={state:{...state},result:prediction(hiddenRule,state)};
  observations.push(observation);
  const previousKey=hypothesis?ruleKey(hypothesis):null;
  const proposed=await provider.infer({observations:structuredClone(observations),previousRule:hypothesis});
  hypothesis=proposed.rule;
  if(previousKey&&previousKey!==ruleKey(hypothesis))revisions++;
  const consistent=consistentCandidates(observations).some(c=>ruleKey(c)===ruleKey(hypothesis));
  if(!consistent)invalidHypotheses++;
  trace.push({step:step+1,observation,hypothesis:ruleKey(hypothesis),consistent,accuracy:accuracy(hypothesis,hiddenRule),remainingModels:consistentCandidates(observations).length});
 }
 return {experiments:observations.length,accuracy:hypothesis?accuracy(hypothesis,hiddenRule):0,revisions,invalidHypotheses,finalHypothesis:hypothesis?ruleKey(hypothesis):null,trace};
}
async function runBenchmark(provider,{maxExperiments=5}={}){
 if(!provider||typeof provider.infer!=='function')throw Error('Provider must implement infer');
 if(!Number.isInteger(maxExperiments)||maxExperiments<2||maxExperiments>8)throw Error('Invalid experiment budget');
 const scenarios=[];
 for(const w of experimentWorlds()){
  const initial=await runPhase({provider,hiddenRule:w.initial,maxExperiments});
  // Change environment. Do not carry over incompatible observations; carry prior hypothesis only.
  const changed=await runPhase({provider,hiddenRule:w.changed,previousRule:{op:initial.finalHypothesis?.split('(')[0],inputs:initial.finalHypothesis?.match(/\(([^)]+)\)/)?.[1]?.split(',')},maxExperiments});
  scenarios.push({world:w.id,initial,changed});
 }
 const phases=scenarios.flatMap(s=>[s.initial,s.changed]);
 const avg=phases.reduce((sum,p)=>sum+p.accuracy,0)/phases.length;
 const valid=phases.reduce((sum,p)=>sum+p.trace.length-p.invalidHypotheses,0);
 const total=phases.reduce((sum,p)=>sum+p.trace.length,0);
 const summary={provider:provider.kind||'unknown',scenarioCount:scenarios.length,phases:phases.length,observations:total,meanTruthTableAccuracy:+avg.toFixed(4),hypothesisConsistencyRate:total?+(valid/total).toFixed(4):0,revisionCount:phases.reduce((sum,p)=>sum+p.revisions,0),realModelInference:provider.kind==='live-qwen',memoryEnabled:false};
 return {summary,scenarios};
}
module.exports={accuracy,runPhase,runBenchmark};
