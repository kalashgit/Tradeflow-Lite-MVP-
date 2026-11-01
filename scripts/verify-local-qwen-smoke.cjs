#!/usr/bin/env node
// Development-only Qwen smoke test. Uses synthetic data, never reads customer records.
'use strict';
const assert = require('node:assert/strict');
const base = process.env.TRADEFLOW_LOCAL_AI_URL || 'http://127.0.0.1:8088';
const endpoint = new URL('/v1/chat/completions', base);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) {
  console.error('Refusing non-loopback model endpoint. This smoke test is local-only.');
  process.exit(2);
}
const evidence = Object.freeze([
  { id: 'SYN-LAB-01', kind: 'labor_overrun', description: 'Job A has 12 actual labor hours above its 40-hour budget; final cost impact unknown.' },
  { id: 'SYN-AR-02', kind: 'overdue_invoice', description: 'A $4,200 invoice is 15 days overdue; collection status unverified. This is cash timing, not new profit.' },
  { id: 'SYN-QT-03', kind: 'quote_followup', description: 'A $7,500 quote awaits customer response; margin and crew availability unknown.' }
]);
async function main() {
  const payload = {
    messages: [
      { role: 'system', content: 'You are TradeFlow, a read-only assistant. All records are SYNTHETIC. Explain no more than 2 prioritized review actions in at most 100 words. Reference only evidence IDs given. Do not invent costs, savings, profit or authority. Cash collection is not new profit. Do not issue commands or claim an action was executed. If evidence is insufficient, say so.' },
      { role: 'user', content: 'What should I prioritize today to improve profitability? Evidence: ' + JSON.stringify(evidence) }
    ],
    chat_template_kwargs: { enable_thinking: false },
    temperature: 0.1,
    max_tokens: 320,
    stream: false
  };
  const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(180000) });
  const raw = await res.text();
  if (!res.ok) throw new Error('Local server returned HTTP ' + res.status + ': ' + raw.slice(0, 500));
  const result = JSON.parse(raw);
  const answer = result.choices?.[0]?.message?.content?.trim();
  assert.ok(answer, 'Model returned no user-facing content (check thinking mode/token budget)');
  console.log('Model answer (UNTRUSTED, SYNTHETIC evidence):\n' + answer);
  console.log('\nfinish_reason:', result.choices[0].finish_reason);
  if (result.choices[0].finish_reason === 'length') {
    console.error('WARNING: answer hit token limit; increase max_tokens or shorten prompt.');
    process.exitCode = 1;
  }
  const cited = [...answer.matchAll(/SYN-[A-Z]+-\d+/g)].map(m => m[0]);
  const known = new Set(evidence.map(x => x.id));
  if (cited.some(id => !known.has(id))) {
    console.error('FAIL: hallucinated evidence ID in answer');
    process.exitCode = 1;
  }
  if (!cited.length) {
    console.error('WARNING: no evidence ID cited; response is not evidence-linked.');
    process.exitCode = 1;
  }
}
main().catch(e => { console.error('Smoke test failed:', e.message); process.exitCode = 1; });
