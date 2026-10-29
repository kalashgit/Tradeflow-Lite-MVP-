const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const intake=require('../public/document-intake.js');
test('extract explicit job fields, retaining original line evidence',()=>{
 const text='Job: Replace damaged breaker\nCustomer: Austin Electric LLC\nSite Address: 6801 River Place Blvd, Austin, TX 78726\nScheduled Date: 2026-11-02\nStart Time: 09:30\nDuration: 90\nExtra note that is not mapped';
 const r=intake.extract(text,'jobs');
 assert.equal(r.fields.title,'Replace damaged breaker');
 assert.equal(r.fields.customerId,'Austin Electric LLC');
 assert.equal(r.fields.address,'6801 River Place Blvd, Austin, TX 78726');
 assert.equal(r.fields.date,'2026-11-02');
 assert.equal(r.fields.scheduleTime,'09:30');
 assert.ok(r.evidence.address.startsWith('Site Address:'));
 assert.ok(r.unmatched.includes('Extra note that is not mapped'));
});
test('unlabeled facts do not silently become business records',()=>{
 const r=intake.extract('6801 River Place Blvd\nJohn Smith\nMonday afternoon','jobs');
 assert.deepEqual(r.fields,{});
 assert.ok(r.uncertain.length);
});
test('ambiguous field labels request review rather than overwrite',()=>{
 const r=intake.extract('Job: New panel\nJob: Fix lighting','jobs');
 assert.equal(r.fields.title,'New panel');
 assert.ok(r.uncertain.some(x=>x.includes('title')));
});
test('customer fields and quote fields are type-scoped',()=>{
 assert.equal(intake.extract('Phone: +1 512 555 0199\nEmail: a@example.com','customers').fields.email,'a@example.com');
 assert.equal(intake.extract('Amount: $250\nDate sent: 2026-11-01','quotes').fields.amount,'$250');
 assert.equal(intake.extract('Amount: $250','jobs').fields.amount,undefined);
});
test('CSV is quoted and formula-like contents are escaped',()=>{
 const csv=intake.asCsv('jobs',{title:'=SUM(1,1)',customerId:'Existing Customer'});
 assert.match(csv,/"'=SUM\(1,1\)"/);
 assert.match(csv,/"Existing Customer"/);
});
test('document review routes through same CSV overlay, never a direct record mutation',()=>{
 const lib=fs.readFileSync('public/library.js','utf8'),app=fs.readFileSync('public/app.js','utf8');
 assert.match(lib,/tf-library-import/);
 assert.match(lib,/engine\.asCsv/);
 assert.match(app,/tfImportReadFile\(file\)/);
 assert.match(app,/sourceDocumentId/);
});
