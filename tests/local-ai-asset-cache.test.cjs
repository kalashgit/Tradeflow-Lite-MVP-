'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pub=path.resolve(__dirname,'../public');
const html=fs.readFileSync(path.join(pub,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(pub,'sw.js'),'utf8');
test('offline app and AI styles referenced by index are present in service worker cache manifest',()=>{
 const app=html.match(/<script type="module" src="(\.\/app\.js[^"]*)"/);
 const style=html.match(/<link rel="stylesheet" href="(\.\/ai-preview\.css[^"]*)"/);
 assert.ok(app,'Index must include TradeFlow application script');
 assert.ok(style,'Index must include TradeFlow assistant style');
 for(const asset of [app[1],style[1]])assert.ok(sw.includes("'"+asset+"'"),'Offline cache missing '+asset);
 assert.match(sw,/self\.addEventListener\('fetch'/);
});
