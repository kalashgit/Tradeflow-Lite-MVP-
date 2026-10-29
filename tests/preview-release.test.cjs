const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
function run(alwaysStale){
 const built=cp.spawnSync(process.execPath,['automation/preview-release.cjs','build'],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
 const code=`const fs=require('node:fs');const expected=JSON.parse(fs.readFileSync('public/release.json'));let calls=0;global.setTimeout=fn=>{queueMicrotask(fn);return 0};global.fetch=async url=>{const u=new URL(url);if(u.pathname==='/release.json'){calls++;return Response.json(${alwaysStale?'true':'calls===1'}?{...expected,commit:'stale'}:expected)}return new Response(fs.readFileSync('public'+decodeURIComponent(u.pathname)))};process.argv=['node','automation/preview-release.cjs','verify','https://tradeflow-library-pilot-preview.bartoszszarafinski.workers.dev'];process.on('exit',()=>console.log('manifestCalls='+calls));require('./automation/preview-release.cjs');`;
 return cp.spawnSync(process.execPath,['-e',code],{encoding:'utf8',timeout:10000});
}
test('preview verification tolerates rollout propagation while still requiring exact bytes',()=>{const r=run(false);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/VERIFIED/);assert.match(r.stdout,/manifestCalls=2/)});
test('preview verification never accepts a stale release after retry budget',()=>{const r=run(true);assert.equal(r.status,1);assert.match(r.stderr,/does not match exact source/);assert.match(r.stdout,/manifestCalls=6/)});
test('CI logging cannot mask a failing regression exit code',()=>{
 const workflow=require('node:fs').readFileSync('.github/workflows/library-pilot-preview.yml','utf8');assert.match(workflow,/name: Syntax and regression checks\n\s+shell: bash\n\s+run: \|\n\s+set -euo pipefail/);
 const r=cp.spawnSync('bash',['-euo','pipefail','-c','node -e "process.exit(7)" | tee /dev/null'],{encoding:'utf8'});assert.equal(r.status,7);
});
