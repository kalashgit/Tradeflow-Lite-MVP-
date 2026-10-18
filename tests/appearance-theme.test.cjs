'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const appearance=require('../public/appearance-theme.js');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const css=fs.readFileSync('public/appearance-theme.css','utf8');
for(const color of ['#10cfe1','#00ff00','#000000','#ffffff','#101240','#ff0000','#ffff00','#800080','#212121','#123456','#ff00ff','#444444']){
 const p=appearance.palette(color);
 assert.equal(p.original,color);
 assert.ok(p.contrastLabel>=4.5,color+': accent text must reach 4.5:1 contrast');
 assert.ok(p.contrastOnButton>=4.5,color+': button text must reach 4.5:1 contrast');
 for(const surface of ['#111214','#17181b','#2a2c31','#34363b']){
  assert.ok(appearance.contrast(p.accentText,surface)>=4.5,color+': readable graphite accent on '+surface);
 }
 assert.equal(p.income,'#00ed64');
 assert.equal(p.expense,'#ff334d');
}
const stub={};const style={setProperty:(k,v)=>{stub[k]=v}};
const p=appearance.apply('#000010',style);
assert.equal(stub['--tf-accent'],p.accent);
assert.equal(stub['--tf-accent-contrast'],p.onAccent);
assert.equal(stub['--tf-accent-original'],'#000010');
for(const neutral of ['--tf-border','--tf-text','--tf-muted']){
 assert.equal(stub[neutral],undefined,'Accent changes must leave shared neutral tokens in control');
}
assert.equal(stub['--tf-income-neon'],'#00ed64');
assert.equal(stub['--tf-expense-neon'],'#ff334d');
assert.equal(appearance.palette('not a color').original,'#10cfe1');
assert.ok(html.includes('./appearance-theme.js')&&html.includes('./appearance-theme.css'),'Appearance resources load');
assert.ok(sw.includes('./appearance-theme.js')&&sw.includes('./appearance-theme.css'),'Appearance works offline');
assert.ok(app.includes("window.TradeFlowAppearance?.apply"),'Settings preference uses adaptive palette');
assert.ok(app.includes('name="accent"'),'Customer choice remains available');
assert.ok(css.includes('prefers-reduced-motion'),'Motion accessibility');
assert.ok(css.includes('--tf-accent-contrast'),'Action foregrounds based on contrast');
console.log('PASS: Adaptive branding contrast for 12 colors; semantic colors, cache, settings wiring');
