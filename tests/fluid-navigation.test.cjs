const {test}=require('node:test'),assert=require('node:assert/strict'),{candidateAt,keyboardIndex,createGesture,moveGesture}=require('../public/fluid-navigation.js');
const c=[40,120,200,280,360];
test('initial contact selects immediately across all five targets',()=>{c.forEach((x,i)=>assert.equal(createGesture(c,0,x,700).candidate,i))});
test('continuous candidate selection is hysteretic and bounded',()=>{assert.equal(candidateAt(83,c,0),0);assert.equal(candidateAt(87,c,0),1);assert.equal(candidateAt(77,c,1),1);assert.equal(candidateAt(73,c,1),0);assert.equal(candidateAt(-100,c,2),0);assert.equal(candidateAt(1000,c,2),4)});
test('horizontal drag previews all tabs without side effects',()=>{const g=createGesture(c,0,40,700);for(let i=0;i<5;i++){moveGesture(g,c[i],702);assert.equal(g.candidate,i);assert.equal(g.selected,0);assert.equal(g.cancelled,false)}});
test('vertical intent cancels instead of selecting another route',()=>{const g=createGesture(c,0,40,700);moveGesture(g,44,730);assert.equal(g.cancelled,true);assert.equal(g.selected,0)});
test('versioned enhancement assets are available offline',()=>{const fs=require('node:fs');for(const f of ['public/index.html','public/sw.js']){const s=fs.readFileSync(f,'utf8');assert.ok(s.includes('fluid-navigation.js?v=f01-r05'));assert.ok(s.includes('fluid-navigation.css?v=f01-r05'))}});

test('role-adaptive keyboard navigation handles 1, 3, and 5 destinations',()=>{
 for(const count of [1,3,5]){
  assert.equal(keyboardIndex('Home',count-1,count),0);
  assert.equal(keyboardIndex('End',0,count),count-1);
  assert.equal(keyboardIndex('ArrowLeft',0,count),0);
  assert.equal(keyboardIndex('ArrowRight',count-1,count),count-1);
 }
});
test('invalid role destination counts never focus an absent button',()=>{
 for(const count of [0,6,-1,NaN])assert.equal(keyboardIndex('End',0,count),-1);
 assert.equal(keyboardIndex('PageDown',0,5),-1);
 assert.equal(keyboardIndex('ArrowRight',-1,3),1);
 assert.equal(keyboardIndex('ArrowLeft',8,3),0);
});
test('hysteretic selection remains safe with fewer authorized destinations',()=>{
 const centers=[60,180,300],g=createGesture(centers,0,60,700);
 assert.equal(g.candidate,0);
 moveGesture(g,300,701);assert.equal(g.candidate,2);
 moveGesture(g,-100,701);assert.equal(g.candidate,0);
 assert.equal(g.cancelled,false);
});
