'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const retrieval=require('../public/academy-retrieval.js');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/academy-catalog.json'),'utf8'));
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('complete Notion Academy catalog is metadata-only and no book passages are represented',()=>{
 const index=retrieval.create(catalog);
 assert.equal(index.sourceCount,59);
 assert.deepEqual(catalog.sources.reduce((acc,s)=>(acc[s.cohort]++,acc),{A:0,B:0,C:0}),{A:19,B:20,C:20});
 assert.equal(new Set(catalog.sources.map(s=>s.sourceId)).size,59);
 assert.ok(catalog.sources.every(s=>s.ingestionStatus==='metadata_only'&&s.rightsStatus==='not_reviewed'&&s.passageCount===0));
});
test('explicit Academy question returns attributed offline catalog entries, not an invented book lesson',()=>{
 const result=retrieval.create(catalog).answer('Search the Academy books about construction job costs');
 assert.equal(result.handled,true);
 assert.ok(result.hits.some(h=>h.title.includes('Construction Accounting')));
 assert.match(result.content,/OFFLINE CATALOG ONLY/);
 assert.match(result.content,/not the books or verified technical passages/);
 assert.ok(result.refs.every(ref=>/^academy:tf-academy-\d{3}@1$/.test(ref)));
 assert.doesNotMatch(result.content,/I read the full book|the code requires/);
});
test('ordinary contractor questions remain on their preexisting chat path',()=>{
 assert.equal(retrieval.isAcademyQuestion('Which invoices are overdue?'),false);
 assert.deepEqual(retrieval.create(catalog).answer('Which invoices are overdue?'),{handled:false});
 assert.equal(retrieval.isAcademyQuestion('What Academy sources explain project constraints?'),true);
});
test('catalog fails closed on invented content or malformed identity',()=>{
 const bad=structuredClone(catalog);
 bad.sources[0].ingestionStatus='full_text';
 assert.throws(()=>retrieval.create(bad),/Invalid Academy source metadata/);
 const duplicate=structuredClone(catalog);
 duplicate.sources[1].sourceId=duplicate.sources[0].sourceId;
 assert.throws(()=>retrieval.create(duplicate),/Invalid Academy source metadata/);
});
test('existing conversation is wired before private cloud fallback and cached for offline use',()=>{
 const app=read('public/app.js'),html=read('public/index.html'),sw=read('public/sw.js'),conversation=read('public/conversation-store.js');
 const send=app.slice(app.indexOf('async function tfAISend('));
 assert.match(app,/if\(await tfAiLocalAcademy\(content\)\)return;/);
 assert.ok(send.indexOf('if(await tfAiLocalAcademy(content))return;')<send.indexOf('if(!tfAiKey())await tfAiRestoreSession()'));
 assert.match(app,/source:'academy_metadata'/);
 assert.match(html,/academy-retrieval\.js\?v=academy-v1/);
 assert.match(sw,/\.\/academy-catalog\.json/);
 assert.match(conversation,/academy_metadata/);
});
