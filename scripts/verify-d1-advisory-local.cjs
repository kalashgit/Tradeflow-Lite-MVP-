/* H04-14b: disposable, LOCAL Wrangler D1 acceptance. No production binding or egress.
 * Run: node scripts/verify-d1-advisory-local.cjs
 * This exercises the actual D1 emulator, not the SQLite Python bridge.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');

const businessId='business_001';
const issuer='https://synthetic-d1.example';
const subject='synthetic_owner';
const principal=Object.freeze({verified:true,issuer,subject});
const advisoryEnv={TF_ADVISORY_ENABLED:'true',TF_ADVISORY_PROVIDER:'mock'};
const sql=(db,text,params=[])=>db.prepare(text).bind(...params).run();

async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tradeflow-d1-advisory-'));
 let dispose;
 try{
  // Never load the repository's real wrangler.jsonc, account, or D1 binding.
  const config=path.join(tmp,'wrangler.json');
  fs.writeFileSync(config,JSON.stringify({
   name:'tradeflow-advisory-disposable-test',
   compatibility_date:'2026-10-13',
   main:path.resolve('src/index.js'),
   d1_databases:[{binding:'TF_DB',database_name:'tradeflow-advisory-disposable',
    database_id:'00000000-0000-4000-8000-000000000000'}]
  }));
  const {getPlatformProxy}=await import('wrangler');
  const proxy=await getPlatformProxy({configPath:config,persist:{path:path.join(tmp,'state')}});
  dispose=proxy.dispose;
  const db=proxy.env.TF_DB;
  assert.ok(db?.prepare,'local D1 binding unavailable');
  // Minimal test-only projection of the committed tenant schema. Migration
  // compatibility is tested separately; this checks D1 query execution.
  for(const ddl of [
   'CREATE TABLE businesses (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL)',
   "CREATE TABLE business_memberships (business_id TEXT NOT NULL, issuer TEXT NOT NULL, subject TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', PRIMARY KEY(business_id,issuer,subject))",
   "CREATE TABLE tenant_records (business_id TEXT NOT NULL, record_type TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, PRIMARY KEY(business_id,record_type,id))",
   'CREATE TABLE tenant_audit_events (id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, issuer TEXT NOT NULL, subject TEXT NOT NULL, action TEXT NOT NULL, record_type TEXT, record_id TEXT)'
  ])await db.prepare(ddl).run();
  await sql(db,'INSERT INTO businesses (id,name) VALUES (?,?)',
   [businessId,'Synthetic D1 contractor']);
  await sql(db,'INSERT INTO businesses (id,name) VALUES (?,?)',
   ['business_002','Foreign synthetic tenant']);
  await sql(db,'INSERT INTO business_memberships (business_id,issuer,subject,role) VALUES (?,?,?,?)',
   [businessId,issuer,subject,'owner']);
  const {readIntelligenceContext}=await import('../src/intelligence-context.js');
  const {requestAuthorizedServerAdvisory}=await import('../src/advisory-authorization.js');
  const runAdvisory=(context,transport,store=db)=>requestAuthorizedServerAdvisory({
   db:store,principal,context,env:advisoryEnv,intent:'evidence_gaps',transport
  });
  // H04-15b: compare the live guarded query against a json_each-first
  // indexed-key lookup candidate. This is disposable D1 evidence only:
  // do not change runtime SQL on a query-plan hypothesis alone.
  const candidateSql=`SELECT tr.record_type,tr.id,tr.revision,tr.updated_at,tr.deleted_at,tr.payload
   FROM json_each(?) AS wanted
   JOIN tenant_records AS tr ON tr.business_id=?
    AND tr.record_type=json_extract(wanted.value,'$.type')
    AND tr.id=json_extract(wanted.value,'$.id')
   WHERE EXISTS (SELECT 1 FROM business_memberships m
    WHERE m.business_id=tr.business_id AND m.business_id=?
     AND m.issuer=? AND m.subject=? AND m.status='active' AND m.role=?)
   LIMIT 201`;
  const sortedRows=rows=>rows.map(row=>JSON.stringify(row)).sort();
  const compareCandidate=async(query,params,expectedCount,label)=>{
   assert.equal(params.length,6);
   const baseline=(await db.prepare(query).bind(...params).all()).results;
   const candidate=(await db.prepare(candidateSql).bind(...params).all()).results;
   assert.deepEqual(sortedRows(candidate),sortedRows(baseline),
    'candidate evidence lookup must exactly match current guarded query: '+label);
   assert.equal(baseline.length,expectedCount,label+' evidence count');
   const plan=(await db.prepare('EXPLAIN QUERY PLAN '+candidateSql)
    .bind(...params).all()).results;
   assert.ok(plan?.length>0&&plan.every(row=>typeof row.detail==='string'));
   console.log('Local D1 '+label+' candidate plan: '+plan.map(row=>row.detail).join(' | '));
   return baseline;
  };
  let batchQuery,lastBatchParams;
  let positive=0,negative=0;
  const durations={};
  // Start at 2 so the exact runtime batch SQL can also be compared at 1.
  for(const count of [2,1,200]){
   await sql(db,'DELETE FROM tenant_records');
   await sql(db,`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<?)
    INSERT INTO tenant_records (business_id,record_type,id,revision,payload)
    SELECT ?, 'jobs', 'job_'||printf('%03d',n), 1,
     json_object('id','job_'||printf('%03d',n),'businessId',?,'title','Disposable D1 job')
    FROM seq`,[count,businessId,businessId]);
   const context=await readIntelligenceContext({db,principal,businessId});
   assert.equal(context.records.length,count);
   let snapshots=0,calls=0;
   const snapshotPlans=[];
   const instrumented={prepare(query){
    const statement=db.prepare(query);
    return {bind(...params){
     assert.ok(params.length<=100,'D1 bound-parameter ceiling exceeded');
     if(query.includes('JOIN json_each(')){
      snapshots++;assert.equal(params.length,6);
      snapshotPlans.push({query,params});
     }
     return statement.bind(...params);
    }};
   }};
   const started=performance.now();
   const result=await runAdvisory(context,async payload=>{
    calls++;assert.equal(payload.evidence.length,count);
    return {text:'Synthetic local D1 evidence review'};
   },instrumented);
   durations[count]=Math.round(performance.now()-started);
   assert.equal(result.readOnly,true);
   assert.equal(result.executionAuthority,false);
   assert.equal(calls,1);
   assert.equal(snapshots,count===1?0:2);
   assert.equal(snapshotPlans.length,snapshots);
   // Explain the *same* six-bind statement in disposable D1, not a SQLite
   // stand-in. This is a query-plan diagnostic, not a performance SLA.
   for(const {query,params} of snapshotPlans){
    const plan=await db.prepare('EXPLAIN QUERY PLAN '+query).bind(...params).all();
    assert.ok(Array.isArray(plan?.results)&&plan.results.length>0,
     'local D1 query plan unavailable');
    assert.ok(plan.results.every(row=>typeof row.detail==='string'),
     'local D1 query plan detail missing');
   }
   if(snapshotPlans.length){
    const {query,params}=snapshotPlans[0];
    batchQuery=query;lastBatchParams=params;
    const plan=await db.prepare('EXPLAIN QUERY PLAN '+query).bind(...params).all();
    console.log('Local D1 '+count+'-record evidence plan: '+
     plan.results.map(row=>row.detail).join(' | '));
   }
   // The single-record runtime uses its guarded point-read; compare the
   // batch alternative for one record independently without changing it.
   const comparisonParams=snapshotPlans[0]?.params||[
    JSON.stringify(context.records.map(row=>({type:row.type,id:row.id}))),
    businessId,businessId,issuer,subject,'owner'];
   await compareCandidate(batchQuery,comparisonParams,count,count+' records');
   positive++;
   console.log(`PASS local D1 ${count} record(s): ${snapshots} six-bind snapshots; ${durations[count]} ms`);
  }
  // Revoke during inference; final authorization must deny the result.
  const current=await readIntelligenceContext({db,principal,businessId});
  await assert.rejects(runAdvisory(current,async()=>{
   await sql(db,"UPDATE business_memberships SET status='suspended' WHERE business_id=?",
    [businessId]);
   await compareCandidate(batchQuery,lastBatchParams,0,'revoked membership');
   return {text:'Never return after revocation'};
  }),error=>error.code==='authorization_denied');
  negative++;
  await sql(db,"UPDATE business_memberships SET status='active' WHERE business_id=?",[businessId]);
  // Foreign tenant row must not leak into the company snapshot.
  await sql(db,'INSERT INTO tenant_records (business_id,record_type,id,revision,payload) VALUES (?,?,?,?,?)',
   ['business_002','jobs','foreign_001',1,
    JSON.stringify({id:'foreign_001',businessId:'business_002',title:'Foreign'})]);
  const isolated=await readIntelligenceContext({db,principal,businessId});
  assert.equal(isolated.records.length,200);
  assert.ok(isolated.records.every(row=>row.id!=='foreign_001'));
  await compareCandidate(batchQuery,lastBatchParams,200,'foreign tenant excluded');
  await assert.rejects(readIntelligenceContext({db,principal,businessId:'business_002'}),
   error=>error.status===403);
  negative++;
  // Revision changed while transport is running must invalidate evidence.
  await assert.rejects(runAdvisory(isolated,async()=>{
   await sql(db,"UPDATE tenant_records SET revision=revision+1 WHERE business_id=? AND id=?",
    [businessId,'job_001']);
   const changed=await compareCandidate(batchQuery,lastBatchParams,200,'stale revision');
   assert.equal(changed.find(row=>row.id==='job_001')?.revision,2);
   return {text:'Never return after revision change'};
  }),error=>error.code==='authorization_denied');
  negative++;
  const audit=await db.prepare('SELECT COUNT(*) AS n FROM tenant_audit_events').first();
  assert.equal(audit.n,0,'advisory must never create business audit writes');
  console.log(`H04-15b local Wrangler D1 acceptance and candidate equivalence: ${positive}/3 positive and ${negative}/3 negative checks passed; timings are non-production diagnostics.`);
 }finally{
  if(dispose)await dispose();
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error('H04-14b local D1 acceptance FAILED:',error);process.exitCode=1;});
