'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../wrangler.iphone-preview.jsonc'),'utf8'));
const source=fs.readFileSync(path.join(__dirname,'../src/iphone-preview.js'),'utf8');
test('iPhone preview uses isolated static assets and AI only, never business data bindings',()=>{
 assert.equal(config.name,'tradeflow-pr16-private');
 assert.equal(config.assets.directory,'./public');
 assert.equal(config.main,'./src/iphone-preview.js');
 assert.equal(config.ai.binding,'AI');
 for(const unsafe of ['d1_databases','kv_namespaces','r2_buckets','services','durable_objects'])assert.equal(config[unsafe],undefined,unsafe);
 assert.equal(config.vars.TF_IPHONE_PREVIEW_MODE,'private-online-chat-no-customer-data');
});
test('iPhone preview only exposes constrained chat and health; other APIs fail closed',()=>{
 assert.match(source,/url\.pathname==='\/api\/ai\/chat'/);
 assert.match(source,/url\.pathname==='\/api\/ai\/health'/);
 assert.match(source,/url\.pathname\.startsWith\('\/api\/'\)/);
 assert.match(source,/json\(\{error:'This private preview does not enable business record APIs'\},503\)/);
 assert.match(source,/env\.ASSETS\.fetch\(request\)/);
 assert.match(source,/body\?\.business!==null/);
 assert.match(source,/raw\.length===0/);
});
test('private online preview never asks for legacy app-level code and excludes customer context',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 assert.match(app,/Private online AI · no additional access code/);
 assert.match(app,/tfChatWithSummary&&!tfAiOfflinePreview/);
 assert.match(app,/!tfAiOfflinePreview&&!tfAiKey\(\)/);
 assert.doesNotMatch(app,/Online AI is disabled in this private offline preview/);
});
