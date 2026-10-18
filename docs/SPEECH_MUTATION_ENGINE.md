# Contextual speech mutation engine

`public/speech-mutation-engine.js` is a pure local candidate ranker. It reads no dataset, database, audio, network or storage. Scores measure rule evidence, not statistical probabilities. The synthetic mutation bank is used by tests and evaluation only.

```js
const ranker = TradeFlowSpeechMutationEngine.createEngine({tools: [{
  id: 'warranty.inspect', effect: 'read_only',
  language: {
    actions: ['inspect', 'review'], objects: ['warranty', 'guarantee'],
    contexts: ['jobs'],
    fields: [{name: 'recordId', type: 'identifier', markers: ['number'], required: true}]
  }
}]});
const result = ranker.rankCandidates('Inspect warrantie number W-0017', {sourcePage: 'jobs'});
```

New tools register vocabulary and parameter metadata. They do not need a matcher for each utterance. Shared action concepts include create, prepare, query, open, find, schedule and contact. Explicit object synonyms are trusted capability vocabulary, not inferred business facts. Typed fields support text, names, phones, money, dates, times, identifiers, addresses and verified record references.

Only action/object spans participate in edit-distance, phonetic and segmentation matching. Critical spans retain offsets and raw evidence. Names and record identities never use fuzzy lookup. Identifier case/digits and address text remain literal. Phone formatting/digit words are validated in a phone field; missing digits are never reconstructed. Money requires an explicit numeric value and preserves its raw representation. The host's existing date/time and business-record adapters remain authoritative.

Candidates include score, effect, parameters, evidence, structural normalizations, missing information, issues and contextual support. A query-object recovery needs an exact grammar anchor plus business context. Uncertain action words and recovered drafts/modifications require review. Competing tools within the score margin remain ambiguous. Unparsed details cannot be silently discarded by a generic tool. The trusted `allowContextTail` option is reserved for adapters that explicitly handle their own query constraints.

Negation, conditions, help questions, reported speech, marked noise, truncation and conflicting critical values block acceptance. Explicit self-corrections retain both values as evidence and require review. A candidate being accepted never authorizes a business operation. No execution interface exists.

The module has independent tests, including generated variations of a new permit tool that never appeared in the bank. Main-app integration is supplied separately through `command-intelligence.js`; shared application integration files remain untouched.

## Existing interpreter integration

Load `record-interpreter.js`, `speech-mutation-engine.js`, then `command-intelligence.js`. The existing application team owns inserting those scripts into the main app. The standalone lab already loads and caches the new dependency in its own scope.

```js
const engine = TradeFlowCommandIntelligence.createEngine({tools: [
  ...TradeFlowCommandIntelligence.builtinTools,
  {id:'permit.inspect', effect:'read_only', language:{
    actions:['inspect','review'], objects:['permit','authorization'], contexts:['jobs'],
    fields:[{name:'recordId',type:'identifier',markers:['number'],required:true}]
  }}
]});
const result = engine.interpretCommand(transcript, context);
const alternatives = engine.rankCommandCandidates(transcript, context);
```

Built-in exact interpretation paths continue reusing their current business extractors. Unfamiliar structural vocabulary is ranked and passed back through those same extractors. A declarative tool without match/extract callbacks uses the generic typed-field adapter. Existing callback-based registrations remain supported. The engine exposes capability metadata without loading a mutation bank.

`candidateRanking` summarizes ranked intent alternatives and evidence. `interpretationPath` distinguishes existing adapters from contextual candidates. `parameterEvidence` retains raw typed values for generic tools; `criticalEvidence` retains numbers, monetary values, dates, times and other protected spans. An adapter that cannot represent a supplied amount/date/time requires clarification instead of silently omitting it.

Custom-tool verbs participate in compound draft planning; plans remain `executable:false`. No registry or database write is added. After a user explicitly chooses a candidate, the host may re-interpret its `normalizedTranscript`; this structural-only view still retains negation, conditions and original critical values. Only the existing authoritative registry may prepare, approve and execute the actual operation.

The fixture expectations for qoute/coats/estimit/sight drafts were deliberately tightened from recognized to review-required. This is a safety-policy change under the new requirement, not a transcription accuracy improvement. Labeled intent and field evaluation remains separate from these status expectations.
