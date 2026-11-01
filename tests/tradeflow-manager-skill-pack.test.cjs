'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../.agents/skills');
const slugs=['tradeflow-principal-manager','tradeflow-agent-operations','tradeflow-product-strategy','tradeflow-customer-discovery','tradeflow-value-engineering','tradeflow-pilot-and-sales','tradeflow-release-governance','tradeflow-daily-management'];

test('Manager has one principal and seven bounded specialist entrypoints',()=>{
 for(const slug of slugs)assert.ok(fs.existsSync(path.join(root,slug,'SKILL.md')),'Missing manager skill '+slug);
});
test('Manager skill frontmatter, UI metadata and reference contracts are valid',()=>{
 for(const slug of slugs){
  const dir=path.join(root,slug),raw=fs.readFileSync(path.join(dir,'SKILL.md'),'utf8');
  const front=raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(front,'Missing frontmatter '+slug);
  assert.match(front[1],new RegExp('^name: '+slug+'$','m'));
  const desc=front[1].match(/^description: (.+)$/m)?.[1];
  assert.ok(desc&&desc.length>=80&&desc.length<500,'Invalid description '+slug);
  assert.ok(raw.split('\n').length<500,'Oversized manager skill '+slug);
  const meta=fs.readFileSync(path.join(dir,'agents/openai.yaml'),'utf8');
  assert.match(meta,/^interface:\s*$/m);
  assert.match(meta,/^\s+display_name: TradeFlow /m);
  assert.match(meta,/^\s+short_description: /m);
  const refs=[...raw.matchAll(/`(references\/[^`\n]+\.md)`/g)].map(x=>x[1]);
  assert.ok(refs.length>0,'No reference contract '+slug);
  for(const ref of refs)assert.ok(fs.existsSync(path.join(dir,ref)),'Missing reference '+slug+': '+ref);
 }
});
test('Principal manager dispatches every specialist and defers code writing to engineering',()=>{
 const p=fs.readFileSync(path.join(root,'tradeflow-principal-manager/SKILL.md'),'utf8');
 for(const slug of slugs.slice(1))assert.ok(p.includes(slug+'/SKILL.md'),'Unrouted '+slug);
 for(const term of ['principal-ai-engineer','current','GitHub','approval','verified','customer'])assert.ok(p.toLowerCase().includes(term.toLowerCase()),'Missing manager boundary '+term);
});
test('Manager system preserves hypothesis, authorization and operational truth',()=>{
 const idx=fs.readFileSync(path.resolve(__dirname,'../docs/TRADEFLOW_MANAGER_SKILLS.md'),'utf8');
 const hand=fs.readFileSync(path.resolve(__dirname,'../docs/TRADEFLOW_MANAGER_HANDOFF_2026-11-01.md'),'utf8');
 for(const term of ['5–15','Austin','Commercial','0/62','Code / Product / Operations / Outcome','not install','background','draft PR'])assert.ok((idx+'\n'+hand).toLowerCase().includes(term.toLowerCase()),'Unclear manager boundary '+term);
 assert.ok(idx.includes('tradeflow-principal-ai-engineer/SKILL.md'));
 assert.ok(idx.includes('tradeflow-general-app-engineer/SKILL.md'));
 assert.ok(fs.existsSync(path.join(root,'tradeflow-general-app-engineer','SKILL.md')));
 assert.ok(hand.includes('market_model.xlsx'));
});
