'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../.agents/skills');
const required=[
 'tradeflow-principal-ai-engineer','tradeflow-general-app-engineer','tradeflow-database-architect','tradeflow-ai-evaluator',
 'tradeflow-financial-engineer','tradeflow-interface-designer','tradeflow-realtime-voice-engineer',
 'tradeflow-conversation-memory','tradeflow-model-runtime','tradeflow-commercial-platform','tradeflow-workflow-orchestrator'
];
test('principal and ten TradeFlow specialist skill entrypoints are present',()=>{
 for(const slug of required)assert.ok(fs.existsSync(path.join(base,slug,'SKILL.md')),slug+' missing');
});
test('each skill has bounded valid frontmatter, UI metadata and existing references',()=>{
 for(const slug of required){
  const folder=path.join(base,slug),raw=fs.readFileSync(path.join(folder,'SKILL.md'),'utf8');
  const front=raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(front,'Missing frontmatter '+slug);
  assert.match(front[1],new RegExp('^name: '+slug+'$', 'm'));
  const description=front[1].match(/^description: (.+)$/m)?.[1];
  assert.ok(description&&description.length>=70&&description.length<500,'Scope/trigger description invalid '+slug);
  assert.ok(raw.split('\n').length<500,'Oversized skill entrypoint '+slug);
  const meta=fs.readFileSync(path.join(folder,'agents','openai.yaml'),'utf8');
  assert.match(meta,/^interface:\s*$/m);
  assert.match(meta,/^\s+display_name: TradeFlow /m);
  assert.match(meta,/^\s+short_description: /m);
  for(const match of raw.matchAll(/`(references\/[^\`\n]+\.md)`/g)){
   assert.ok(fs.existsSync(path.join(folder,match[1])),slug+' missing referenced file '+match[1]);
  }
 }
});
test('principal dispatches all specialists from the existing repository',()=>{
 const p=fs.readFileSync(path.join(base,'tradeflow-principal-ai-engineer','SKILL.md'),'utf8');
 for(const slug of required.filter(x=>x!=='tradeflow-principal-ai-engineer'))assert.ok(p.includes(slug+'/SKILL.md'),'Principal missing specialist '+slug);
 assert.ok(p.includes('One principal engineer owns'));
});
test('voice architecture explicitly distinguishes planned from verified capabilities',()=>{
 const p=fs.readFileSync(path.resolve(__dirname,'../docs/TRADEFLOW_MASTER_INTELLIGENCE_VOICE_ARCHITECTURE.md'),'utf8');
 for(const term of ['NOT a deployed speech product','tfChatMessages','shared','Speech','barge-in','tenant','offline','approval'])assert.ok(p.toLowerCase().includes(term.toLowerCase()),'Architecture missing '+term);
});
