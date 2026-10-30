'use strict';
// Fail closed when exact-head regression evidence is absent, incomplete or inconsistent.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
function parseVerification({nodeLog,browserLog,sha}){
 if(typeof sha!=='string'||!/^[0-9a-f]{40}$/.test(sha))throw Error('Exact 40-character commit SHA is required');
 function count(pattern,content,label){
  const hit=pattern.exec(content||'');
  if(!hit)throw Error('Missing '+label+' evidence');
  const n=Number(hit[1]);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid '+label+' count');
  return n;
 }
 const tests=count(/^# tests (\d+)\s*$/m,nodeLog,'Node tests');
 const passed=count(/^# pass (\d+)\s*$/m,nodeLog,'Node passing tests');
 const failed=count(/^# fail (\d+)\s*$/m,nodeLog,'Node failed tests');
 const skipped=count(/^# skipped (\d+)\s*$/m,nodeLog,'Node skipped tests');
 const cancelled=count(/^# cancelled (\d+)\s*$/m,nodeLog,'Node cancelled tests');
 const contractor=/(\d+)\/(\d+) Chromium workflow scenarios passed/.exec(browserLog||'');
 const crossTab=/(\d+)\/(\d+) Chromium two-tab command concurrency scenarios passed/.exec(browserLog||'');
 const context=/(\d+)\/(\d+) Chromium authorized intelligence context scenarios passed/.exec(browserLog||'');
 const twoDevice=/(\d+)\/(\d+) Chromium authenticated two-device sync scenarios passed/.exec(browserLog||'');
 if(!contractor||!crossTab||!context||!twoDevice)throw Error('Required synthetic Chromium scenario reports are missing');
 const contractorPassed=Number(contractor[1]),contractorTotal=Number(contractor[2]);
 const crossTabPassed=Number(crossTab[1]),crossTabTotal=Number(crossTab[2]);
 if(tests<=0||passed!==tests||failed!==0||skipped!==0||cancelled!==0)
  throw Error('Node regression count or skip/failure status is inconsistent');
 const contextPassed=Number(context[1]),contextTotal=Number(context[2]);
 const twoDevicePassed=Number(twoDevice[1]),twoDeviceTotal=Number(twoDevice[2]);
 if(twoDeviceTotal!==2||twoDevicePassed!==twoDeviceTotal||contextTotal!==2||contextPassed!==contextTotal||contractorTotal!==20||crossTabTotal!==2||contractorPassed!==contractorTotal||crossTabPassed!==crossTabTotal)
  throw Error('Chromium scenario count changed, was skipped, or contains failures');
 return {sha,kind:'exact-head-regression-summary',node:{tests,passed,failed,skipped,cancelled},
  chromium:{contractor:{passed:contractorPassed,total:contractorTotal},
   crossTab:{passed:crossTabPassed,total:crossTabTotal},
   context:{passed:contextPassed,total:contextTotal},
   twoDevice:{passed:twoDevicePassed,total:twoDeviceTotal},
   combined:{passed:contractorPassed+crossTabPassed+contextPassed+twoDevicePassed,total:contractorTotal+crossTabTotal+contextTotal+twoDeviceTotal}},
  storage:'passed_as_separate_CI_gate',contractorDetector:'passed_as_separate_CI_gate',
  syntheticOnly:true,physicalDeviceAccepted:false,contractorOperationsVerified:false,painPointsRetired:0};
}
if(require.main===module){
 const sha=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),expected=process.env.TRADEFLOW_EXPECTED_SHA;
 if(expected!==sha)throw Error('CI checkout does not match expected exact head');
 const summary=parseVerification({sha,nodeLog:fs.readFileSync('artifacts/full-node.log','utf8'),
  browserLog:fs.readFileSync('artifacts/browser.log','utf8')});
 fs.mkdirSync('artifacts',{recursive:true});
 fs.writeFileSync(path.join('artifacts','verification-summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log('Verified exact-head Node '+summary.node.passed+'/'+summary.node.tests+
  ' and Chromium '+summary.chromium.combined.passed+'/'+summary.chromium.combined.total+
  '; operational acceptance remains unverified.');
}
module.exports={parseVerification};
