/* Deliberately localhost-only, synthetic fixture preview; never serves business records. */
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const resources = new Map([
 ['/', ['dev/offline-knowledge-preview.html', 'text/html; charset=utf-8']],
 ['/offline-knowledge-pack.js', ['public/offline-knowledge-pack.js', 'text/javascript; charset=utf-8']],
 ['/fixture', ['tests/fixtures/offline-knowledge-demo.json', 'application/json; charset=utf-8']]
]);
const port = Number(process.env.TF_KNOWLEDGE_PREVIEW_PORT || 4237);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('Invalid preview port');
http.createServer((req,res) => {
 const resource = req.method === 'GET' ? resources.get(new URL(req.url,'http://localhost').pathname) : null;
 if (!resource) {res.writeHead(404); res.end('Not found'); return}
 res.writeHead(200, {'content-type':resource[1], 'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'"});
 fs.createReadStream(path.join(root,resource[0])).pipe(res);
}).listen(port,'127.0.0.1',() => process.stdout.write(`Synthetic offline knowledge preview: http://127.0.0.1:${port}\n`));
