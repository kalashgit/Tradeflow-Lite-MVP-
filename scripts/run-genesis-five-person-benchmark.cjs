#!/usr/bin/env node
// Synthetic AION five-person app-vs-oracle benchmark. Usage:
// node scripts/run-genesis-five-person-benchmark.cjs --mode=oracle --cases=21 --out=/tmp/oracle.json
// node scripts/run-genesis-five-person-benchmark.cjs --mode=qwen --cases=12 --model=qwen3:0.6b --out=/tmp/qwen.json
// Qwen requires explicitly started loopback Ollama or equivalent local provider.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {run}=require('../automation/simulator/genesis-five-person-evaluation.cjs');
const opts=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')&&a.includes('=')).map(x=>{
 const index=x.indexOf('=');return [x.slice(2,index),x.slice(index+1)];
}));
const mode=opts.mode||'oracle',count=opts.cases===undefined?mode==='qwen'?12:21:Number(opts.cases);
const out=opts.out||'artifacts/aion-five-person-'+mode+'.json';
const modelId=mode==='qwen'?(opts.model||'qwen3:0.6b'):null;
const modelUrl=opts['model-url']||'http://127.0.0.1:11434';
if(!['oracle','qwen'].includes(mode)||!Number.isSafeInteger(count)||count<1||count>21||
  typeof out!=='string'||out.length>300)throw Error('Invalid bounded benchmark invocation');
run({mode,maxCases:count,...(modelId?{modelId,baseUrl:modelUrl}:{})}).then(report=>{
 const target=path.resolve(out);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({
  benchmark:report.schema,mode:report.mode,questions:report.questions,
  passed:report.passed,scorePercent:report.exactDecisionQuality,
  citations:report.citationValid,numericalChecks:report.numericValid,
  cautions:report.cautionPresent,actionSafe:report.actionSafe,
  modelCompletions:report.modelCompletion,
  p50Ms:report.medianLatencyMs,p95Ms:report.p95LatencyMs,
  genuineModelInference:report.realModelInference,
  modelTrained:false,externalActions:0,
  rawEvidenceFile:target,
  failedCases:report.results.filter(r=>!r.pass).map(r=>({
   id:r.caseId,status:r.status,deviations:r.deviations
  }))
 },null,2));
}).catch(error=>{console.error('Five-person benchmark failed closed:',error.message);process.exitCode=1});
