'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const pre='const opFields=',start=app.indexOf('function convertE06Audit(rows)'),end=app.indexOf('async function importOpportunities(file)',start);
assert.ok(start>0&&end>start,'The real production importer must expose an auditable conversion function');
const s=app.slice(app.indexOf(pre),app.indexOf('function parseCSV(text)'))+'\n'+app.slice(start,end);
const ctx={URL,Number,Date,Set,Math,console};
vm.runInNewContext(s,ctx,{timeout:2000});
assert.equal(typeof ctx.convertE06Audit,'function');
const headings=['record_id','qc_decision','entity_or_project','submitted_classification','location',
 'original_source_url','source_date','research_date','source_verification','reviewer_notes'];
const row=(id,qc,source='https://data.austintexas.gov/source',sourceDate='2026-10-12',researchDate='2026-10-16',verification='source verified',kind='Potential opportunity')=>
 [id,qc,'Electrical upgrade',kind,'Austin',source,sourceDate,researchDate,verification,'Supported project evidence'];
const data=[headings,
 row('approved-01','APPROVED'),
 row('rejected-02','REJECTED'),
 row('pending-03','UNRESOLVED'),
 row('accepted-04','ACCEPTED','https://example.org/a','2026-10-12','2026-10-16','verified','Verified demand'),
 row('bad-url-05','APPROVED','http://example.org/b'),
 row('missing-date-06','APPROVED','https://example.org/c',''),
 row('unverified-07','APPROVED','https://example.org/d','2026-10-12','2026-10-16','unverified'),
 row('invalid-date-08','APPROVED','https://example.org/e','2026-02-30')];
const result=ctx.convertE06Audit(data);
assert.equal(result.length,3,'Only two audited and source-supported records should be returned');
assert.equal(result.qcExcluded,6,'Rejected and unsupported records must count as excluded');
const field=name=>result[0].indexOf(name);
assert.equal(result[1][field('record_id')],'approved-01');
assert.equal(result[2][field('opportunity_type')],'verified_request');
assert.equal(result[1][field('evidence_status')],'source_supported','Audit cannot automatically mark records verified');
assert.equal(result[2][field('source_date')],'2026-10-12');
const serialized=JSON.stringify(result);
assert.ok(!serialized.includes('rejected-02')&&!serialized.includes('pending-03')&&!serialized.includes('bad-url-05'));
assert.throws(()=>ctx.convertE06Audit([['qc_decision','record_id'],['APPROVED','x']]),/missing required column/i);
assert.ok(app.includes('rejected=auditExcluded'),'The import preview must report excluded records');
assert.ok(app.includes('auditExcluded=converted.qcExcluded'),'Excluded audit records must not be silently hidden');
const brief=fs.readFileSync('public/research-briefs.js','utf8');
assert.ok(brief.includes('data-research-action="template"'));
assert.ok(brief.includes("function csvTemplate()"));
assert.ok(!brief.includes('fake_record_001'));
console.log('PASS: Import QC blocks rejected, unresolved and unsupported audit rows, counts exclusions, preserves source dates');
