#!/usr/bin/env node
'use strict';
const {qwenProvider,oracleProvider}=require('../src/provider.cjs');
const {runBenchmark}=require('../src/benchmark.cjs');
async function main(){
 const [command,...args]=process.argv.slice(2);
 if(command==='probe'){
  const outcome=await qwenProvider().probe();
  console.log(JSON.stringify({status:'PASS',...outcome},null,2));return;
 }
 if(command==='benchmark'){
  const flag=args.indexOf('--provider');
  const kind=flag<0?'qwen':args[flag+1];
  if(!['qwen','oracle'].includes(kind))throw Error('Choose --provider qwen or --provider oracle');
  const provider=kind==='qwen'?qwenProvider():oracleProvider();
  if(kind==='qwen')await provider.probe(); // no fallback to oracle/mocks
  const outcome=await runBenchmark(provider);
  console.log(JSON.stringify(outcome,null,2));
  // Success of the command means the experiment executed, NOT that the research hypothesis passed.
  if(outcome.summary.meanTruthTableAccuracy<0.85||outcome.summary.hypothesisConsistencyRate<0.9)process.exitCode=2;
  return;
 }
 throw Error('Usage: node bin/aion.cjs probe | benchmark --provider qwen|oracle');
}
main().catch(error=>{console.error('AION ERROR:',error.message);process.exitCode=1});
