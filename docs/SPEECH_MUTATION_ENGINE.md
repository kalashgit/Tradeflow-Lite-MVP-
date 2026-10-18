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
