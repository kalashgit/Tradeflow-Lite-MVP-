const {test}=require('node:test'),assert=require('node:assert/strict'),{candidateAt,createGesture,moveGesture}=require('../public/fluid-navigation.js');
const c=[40,120,200,280,360];
test('initial contact selects immediately across all five targets',()=>{c.forEach((x,i)=>assert.equal(createGesture(c,0,x,700).candidate,i))});
test('continuous candidate selection is hysteretic and bounded',()=>{assert.equal(candidateAt(83,c,0),0);assert.equal(candidateAt(87,c,0),1);assert.equal(candidateAt(77,c,1),1);assert.equal(candidateAt(73,c,1),0);assert.equal(candidateAt(-100,c,2),0);assert.equal(candidateAt(1000,c,2),4)});
test('horizontal drag previews all tabs without side effects',()=>{const g=createGesture(c,0,40,700);for(let i=0;i<5;i++){moveGesture(g,c[i],702);assert.equal(g.candidate,i);assert.equal(g.selected,0);assert.equal(g.cancelled,false)}});
test('vertical intent cancels instead of selecting another route',()=>{const g=createGesture(c,0,40,700);moveGesture(g,44,730);assert.equal(g.cancelled,true);assert.equal(g.selected,0)});
test('versioned enhancement assets are available offline',()=>{const fs=require('node:fs');for(const f of ['public/index.html','public/sw.js']){const s=fs.readFileSync(f,'utf8');assert.ok(s.includes('fluid-navigation.js?v=f01-r02'));assert.ok(s.includes('fluid-navigation.css?v=f01-r02'))}});
