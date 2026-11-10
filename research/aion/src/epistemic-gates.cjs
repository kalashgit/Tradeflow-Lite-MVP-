'use strict';
// Epistemic boundary gate. Distinguish a verified unique explanation, ambiguity,
// and observations unexplainable by the known grammar. All statuses deny memory writes.
const {statesFor,consistentRules}=require('./research-gates.cjs');
const VARIABLES=Object.freeze(['A','B','C']);
const UNKNOWN=Object.freeze([
 {name:'three-way-majority',evaluate:s=>Number(s.A+s.B+s.C>=2)},
 {name:'three-way-parity',evaluate:s=>(s.A+s.B+s.C)%2},
 {name:'NAND-A-B',evaluate:s=>1-(s.A&s.B)},
 {name:'NOR-A-C',evaluate:s=>1-(s.A|s.C)}
]);
function assessEvidence(observations,variables=VARIABLES){
 if(!Array.isArray(observations))throw Error('Observations must be an array');
 if(observations.some(o=>!o||!Number.isInteger(o.result)||(o.result!==0&&o.result!==1)))throw Error('Invalid observed output');
 const possible=consistentRules(observations,variables);
 // No candidate => may mean novel mechanism, noisy data, or nonstationarity.
 // Do not assert which is responsible without controlled additional experiments.
 return {status:possible.length===0?'unexplained_or_inconsistent':possible.length===1?'uniquely_identified':'ambiguous',candidateCount:possible.length,uniqueCandidate:possible.length===1?possible[0]:null,admitToPersistentMemory:false};
}
function runEpistemicGates(){
 const inputs=statesFor(VARIABLES);
 const novel=UNKNOWN.map(world=>{
  const observations=inputs.map(state=>({state:{...state},result:world.evaluate(state)}));
  const decision=assessEvidence(observations);
  return {name:world.name,evidenceCount:observations.length,status:decision.status,admitToPersistentMemory:decision.admitToPersistentMemory};
 });
 const ambiguous=assessEvidence([{state:{A:0,B:0,C:0},result:0}]);
 const known=assessEvidence(inputs.map(state=>({state:{...state},result:state.A&state.B})));
 const passed=novel.every(x=>x.status==='unexplained_or_inconsistent'&&!x.admitToPersistentMemory)&&ambiguous.status==='ambiguous'&&known.status==='uniquely_identified'&&!known.admitToPersistentMemory;
 return {kind:'epistemic-boundary-control',passed,realModelInference:false,memoryEnabled:false,unexplainedNovelMechanisms:novel,ambiguousCandidateCount:ambiguous.candidateCount,knownMechanismStatus:known.status,limitation:'A zero-candidate result does not distinguish a new law from measurement noise or changing rules; genuine model invention is untested'};
}
module.exports={UNKNOWN,assessEvidence,runEpistemicGates};
