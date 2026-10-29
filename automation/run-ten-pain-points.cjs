'use strict';
/* CI evidence for ten existing contractor-workflow regression scenarios.
 * Passing code checks NEVER means a pain point is retired.
 */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const manifest=require('./ten-pain-points.json');
const outDir=path.resolve(process.env.TRADEFLOW_EVIDENCE_DIR||'artifacts/ten-pain-points');
fs.mkdirSync(outDir,{recursive:true});
const results=[];
const ids=new Set();
for(const item of manifest.targets){
 if(ids.has(item.id))throw Error('Duplicate target '+item.id);
 ids.add(item.id);
 if(!/^tests\/[a-z0-9-]+\.test\.cjs$/.test(item.test)||!fs.existsSync(item.test))
  throw Error('Invalid or missing evidence test: '+item.test);
 const command=cp.spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern',item.pattern,item.test],{
  encoding:'utf8',timeout:45000,maxBuffer:1024*1024,env:{...process.env,CI:'true'}
 });
 const stdout=command.stdout||'',stderr=command.stderr||'';
 const count=/# pass (\d+)/.exec(stdout);
 const passing=command.status===0&&count&&Number(count[1])>=1&&!command.error;
 results.push({id:item.id,name:item.name,feature:item.feature,test:item.test,pattern:item.pattern,
  status:passing?'code_regression_pass':'code_regression_fail',
  passedTests:count?Number(count[1]):0,exitCode:command.status,
  error:command.error?.message||null});
 fs.writeFileSync(path.join(outDir,item.id+'.log'),stdout+'\n'+stderr);
 process.stdout.write(item.id+' '+(passing?'PASS':'FAIL')+' '+item.name+'\n');
}
const summary={schemaVersion:1,scope:'code-regression-only',generatedAt:new Date().toISOString(),
 commit:process.env.GITHUB_SHA||'local',branch:process.env.GITHUB_REF_NAME||'local',
 total:results.length,codeRegressionPassed:results.filter(r=>r.status==='code_regression_pass').length,
 contractorVerifiedRetired:0,results,
 outstanding:['exact register-row mapping','latest full CI and deployed asset verification',
 'live iPhone and desktop acceptance','contractor scenario evidence','quantified before/after outcome',
 'privacy, backup and synchronization gates where relevant']};
fs.writeFileSync(path.join(outDir,'results.json'),JSON.stringify(summary,null,2)+'\n');
const lines=['# TradeFlow — 10 contractor workflow regressions','',
 'Commit: '+summary.commit,'Generated: '+summary.generatedAt,'',
 '| Target | Existing workflow | Code regression | Contractor verified |',
 '| --- | --- | --- | --- |'];
for(const r of results)lines.push('| '+r.id+' | '+r.name+' | '+(r.status==='code_regression_pass'?'PASS':'FAIL')+' ('+r.passedTests+' test(s)) | **NOT VERIFIED** |');
lines.push('','Code regressions passed: **'+summary.codeRegressionPassed+'/10**.',
'Pain points formally retired: **0/62**, pending mapped register evidence and field acceptance.',
'','## Outstanding verification','');
for(const item of summary.outstanding)lines.push('- '+item);
fs.writeFileSync(path.join(outDir,'report.md'),lines.join('\n')+'\n');
if(results.some(r=>r.status!=='code_regression_pass'))process.exitCode=1;
