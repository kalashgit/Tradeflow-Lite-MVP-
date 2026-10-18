/* Dedicated lab-page scope only. No app cache or business-storage access. */
'use strict';
const CACHE='tradeflow-command-lab-v3';
const ASSETS=['./voice-command-lab.html','./voice-command-lab.js','./voice-command-lab.css','./command-intelligence.js','./record-interpreter.js','./graphite-theme.css'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tradeflow-command-lab-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const asset=ASSETS.find(path=>new URL(path,self.location.href).pathname===url.pathname);if(!asset)return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(asset,copy)))}return response}).catch(()=>caches.open(CACHE).then(cache=>cache.match(asset)).then(response=>response||Response.error())));
});
