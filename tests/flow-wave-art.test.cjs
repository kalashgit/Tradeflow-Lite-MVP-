const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const wave=require('../public/flow-wave-art.js');
test('Flow Wave renders four broad closed surfaces without wireframe or graph traces',()=>{
 const svg=wave.render(),paths=[...svg.matchAll(/<path\b[^>]*d="([^"]+)"/g)];
 assert.equal(paths.length,4);
 for(const [,path]of paths){assert.match(path,/^M /);assert.match(path,/ C /);assert.match(path,/ Z$/)}
 assert.doesNotMatch(svg,/<(?:polyline|line)\b|stroke=|tf-flow-fiber/);
 assert.match(svg,/preserveAspectRatio="xMidYMid meet"/);
 assert.match(svg,/viewBox="0 0 640 238"/);
 assert.ok(svg.length<12000,'Artwork should remain small and self-contained');
});
test('ribbon lighting uses translucent gradients, edge masking and restrained bloom',()=>{
 const svg=wave.render();
 assert.match(svg,/linearGradient/);assert.match(svg,/radialGradient/);
 assert.match(svg,/flow-silk-density-mask/);assert.match(svg,/flow-silk-mask/);
 assert.match(svg,/feGaussianBlur/);assert.match(svg,/feSpecularLighting/);
 assert.doesNotMatch(svg,/<image|<script|https?:\/\//);
});
test('idle, listening and processing have distinct motion and reduced motion disables it',()=>{
 const css=fs.readFileSync('public/voice-command.css','utf8');
 for(const name of ['tfSilkIdle','tfSilkListening','tfSilkProcessing'])assert.match(css,new RegExp('@keyframes '+name));
 assert.match(css,/is-listening \.tf-flow-sheet/);assert.match(css,/is-processing \.tf-flow-sheet/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.tf-flow-sheet\{animation:none!important/);
});
test('voice panel displays Flow Wave and retains the existing executor and microphone controls',()=>{
 const src=fs.readFileSync('public/voice-command.js','utf8');
 assert.ok(src.includes('TradeFlowFlowWave?.render'));assert.ok(src.includes('submit(text)'));
 assert.match(src,/data-voice-workspace/);assert.match(src,/data-voice="mic"/);
});
test('updated artwork and CSS are versioned consistently in HTML and offline cache',()=>{
 const html=fs.readFileSync('public/index.html','utf8'),sw=fs.readFileSync('public/sw.js','utf8');
 assert.ok(html.indexOf('flow-wave-art.js')<html.indexOf('voice-command.js'));
 for(const file of ['flow-wave-art.js','voice-command.css']){
  assert.ok(html.includes(file+'?v=flow-wave-v4'));assert.ok(sw.includes(file+'?v=flow-wave-v4'));
 }
 assert.match(sw,/const CACHE='tradeflow-lite-flow-wave-v4'/);
});
