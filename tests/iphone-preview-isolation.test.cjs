'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../wrangler.iphone-preview.jsonc'),'utf8'));
const source=fs.readFileSync(path.join(__dirname,'../src/iphone-preview.js'),'utf8');
test('iPhone preview uses only isolated static assets with no external bindings',()=>{
 assert.equal(config.name,'tradeflow-pr16-private');
 assert.equal(config.assets.directory,'./public');
 assert.equal(config.main,'./src/iphone-preview.js');
 for(const unsafe of ['d1_databases','ai','kv_namespaces','r2_buckets','services','durable_objects'])assert.equal(config[unsafe],undefined,unsafe);
 assert.equal(config.vars.TF_IPHONE_PREVIEW_MODE,'synthetic-offline-only');
});
test('iPhone preview disables all server APIs rather than simulating writes',()=>{
 assert.match(source,/url\.pathname\.startsWith\('\/api\/'\)/);
 assert.match(source,/status:503/);
 assert.match(source,/env\.ASSETS\.fetch\(request\)/);
});
