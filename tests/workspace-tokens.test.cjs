const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/workspace-tokens.css','utf8');
function luminance(hex){const a=hex.match(/../g).map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('dark workspace foregrounds meet AA normal-text contrast',()=>{for(const [a,b]of [['f5f5f5','17181b'],['f5f5f5','2a2c31'],['a9adb2','17181b'],['a9adb2','2a2c31']])assert.ok(contrast(a,b)>=4.5,a+' on '+b)});
test('semantic focus high contrast and disabled rules preserve text and avoid false success styling',()=>{assert.match(css,/prefers-contrast:more/);assert.match(css,/forced-colors:active/);assert.match(css,/button:disabled/);assert.doesNotMatch(css,/backdrop-filter|animation:(?!none\b)|verified.*green/);assert.match(css,/tf-decision-secondary/);assert.match(css,/tf-command-center/)});
test('offline assets include shared semantic tokens after component styles',()=>{const html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');assert.ok(html.indexOf('workspace-tokens.css')>html.indexOf('adaptive-ui.css'));assert.ok(sw.includes('workspace-tokens.css?v=home-visual-r01'))});
test('document viewport does not opt out of browser zoom',()=>{const html=fs.readFileSync('public/index.html','utf8'),viewport=html.match(/<meta name="viewport"[^>]+>/)?.[0];assert.ok(viewport);assert.doesNotMatch(viewport,/user-scalable=no|maximum-scale=1(?:[,"])/);assert.match(viewport,/viewport-fit=cover/)});

test("white theme is not available",()=>{assert.match(css,/color-scheme:dark/);for(const p of ["public/workspace-tokens.css","public/adaptive-ui.css"])assert.doesNotMatch(fs.readFileSync(p,"utf8"),/data-tf-color-scheme|tf-readable-canvas|color-scheme:light/)});
