/* TradeFlow offline reference retrieval v1.
   Read-only and provider-independent: returned passages are untrusted evidence,
   never model instructions, financial claims or authorization to act. */
(function(root, factory) {
 const api = factory();
 if (typeof module === 'object' && module.exports) module.exports = api;
 if (root) root.TradeFlowOfflineKnowledge = api;
})(typeof globalThis === 'object' ? globalThis : null, function() {
 'use strict';

 const SCHEMA = 'tradeflow.offline-knowledge.v1';
 const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;
 const SHA = /^[a-f0-9]{64}$/;
 const AUDIENCES = new Set(['synthetic_demo', 'redistributable_reference', 'private_device']);
 const RIGHTS = {
  synthetic_demo: new Set(['original_demonstration']),
  redistributable_reference: new Set(['public_domain', 'licensed_redistribution']),
  private_device: new Set(['user_supplied_private_use'])
 };
 const STOP_WORDS = new Set(['a','an','the','is','are','was','were','and','or','of','to','for','in','on','with','what','which','how','do','does','my','our','at','by','from']);
 const MAX_PASSAGES = 2000;
 const MAX_TEXT = 1800;

 function requireString(value, label, max = 240) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Invalid ' + label);
  return value.trim();
 }
 function requireId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw Error('Invalid ' + label);
  return value;
 }
 function date(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value) throw Error('Invalid ' + label);
  return value;
 }
 function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object') throw Error('Private pack requires explicit local business and actor scope');
  return JSON.stringify([requireId(scope.businessId, 'business scope'), requireId(scope.actorId, 'actor scope')]);
 }
 function verifyPack(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack) || pack.schema !== SCHEMA) throw Error('Unsupported knowledge pack schema');
  const id = requireId(pack.id, 'pack id'), version = requireString(pack.version, 'pack version', 80);
  const audience = pack.audience;
  if (!AUDIENCES.has(audience)) throw Error('Unsupported knowledge audience');
  date(pack.builtOn, 'build date');
  if (!Array.isArray(pack.sources) || !Array.isArray(pack.passages) || pack.sources.length > 500 ||
      pack.passages.length > MAX_PASSAGES) throw Error('Knowledge pack exceeds bounded limits');
  const sources = new Map(), passages = [];
  for (const source of pack.sources) {
   if (!source || typeof source !== 'object') throw Error('Invalid source');
   const sid = requireId(source.id, 'source id');
   if (sources.has(sid)) throw Error('Duplicate source id');
   requireString(source.title, 'source title');
   requireString(source.publisher, 'source publisher');
   requireString(source.documentVersion, 'source edition or version', 120);
   date(source.reviewedOn, 'source review date');
   if (!Array.isArray(source.jurisdictions) || !source.jurisdictions.length || source.jurisdictions.length > 16 ||
       source.jurisdictions.some(x => typeof x !== 'string' || !/^(GLOBAL|US|US-[A-Z]{2}|UNKNOWN)$/.test(x))) throw Error('Invalid source jurisdiction');
   if (!RIGHTS[audience].has(source.rights)) throw Error('Source rights do not permit this pack audience');
   requireString(source.rightsEvidence, 'rights review evidence', 500);
   if (!['available_excerpt','metadata_only'].includes(source.contentStatus)) throw Error('Invalid content status');
   if (audience === 'synthetic_demo' && source.kind !== 'synthetic_demo') throw Error('Demo pack must label its synthetic sources');
   if (audience !== 'synthetic_demo' && !['official','book','contractor_sop','other'].includes(source.kind)) throw Error('Invalid source kind');
   if (source.url != null && (!/^https:\/\/[^\s]+$/.test(source.url) || source.url.length > 500)) throw Error('Invalid source URL');
   sources.set(sid, Object.freeze({...source, jurisdictions: source.jurisdictions.slice()}));
  }
  const ids = new Set();
  for (const passage of pack.passages) {
   if (!passage || typeof passage !== 'object') throw Error('Invalid passage');
   const pid = requireId(passage.id, 'passage id'), sid = requireId(passage.sourceId, 'passage source id');
   if (ids.has(pid)) throw Error('Duplicate passage id');
   ids.add(pid);
   const source = sources.get(sid);
   if (!source || source.contentStatus !== 'available_excerpt') throw Error('Passage has missing or metadata-only source');
   requireString(passage.heading, 'passage heading', 180);
   requireString(passage.text, 'passage text', MAX_TEXT);
   if (typeof passage.sha256 !== 'string' || !SHA.test(passage.sha256)) throw Error('Passage SHA-256 required');
   passages.push(Object.freeze({...passage}));
  }
  return Object.freeze({schema:SCHEMA, id, version, audience, builtOn:pack.builtOn,
   sources, passages:Object.freeze(passages)});
 }
 async function digest(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw Error('Secure local SHA-256 implementation unavailable');
  const bytes = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
 }
 function terms(text) {
  return [...new Set((text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !STOP_WORDS.has(w)))];
 }
 async function openPack(raw, {scope} = {}) {
  const pack = verifyPack(raw), privateScope = pack.audience === 'private_device' ? normalizeScope(scope) : null;
  for (const passage of pack.passages) {
   if (await digest(passage.text) !== passage.sha256) throw Error('Passage integrity mismatch: ' + passage.id);
  }
  const indexed = pack.passages.map(passage => {
   const source = pack.sources.get(passage.sourceId);
   const tokens = terms(passage.heading + ' ' + passage.text);
   return {passage, source, tokens:new Set(tokens), normalized:(passage.heading + ' ' + passage.text).toLowerCase()};
  });
  function search(query, {scope:requestScope, jurisdiction, limit = 5} = {}) {
   if (privateScope && normalizeScope(requestScope) !== privateScope) throw Error('Local knowledge scope mismatch');
   const q = requireString(query, 'search query', 240), words = terms(q);
   if (!words.length) return [];
   if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw Error('Invalid result limit');
   if (jurisdiction != null && !/^(GLOBAL|US|US-[A-Z]{2})$/.test(jurisdiction)) throw Error('Invalid jurisdiction filter');
   const ranked = [];
   for (const item of indexed) {
    if (jurisdiction && !item.source.jurisdictions.some(x => x === jurisdiction || x === 'GLOBAL' || x === 'US' && jurisdiction.startsWith('US-'))) continue;
    const matched = words.filter(word => item.tokens.has(word));
    if (!matched.length) continue;
    const score = matched.length / words.length + (item.normalized.includes(q.toLowerCase()) ? 1 : 0);
    ranked.push({score, item});
   }
   ranked.sort((a,b) => b.score - a.score || a.item.passage.id.localeCompare(b.item.passage.id));
   return ranked.slice(0,limit).map(({score,item}) => Object.freeze({
    packId:pack.id, packVersion:pack.version, audience:pack.audience,
    sourceId:item.source.id, title:item.source.title, publisher:item.source.publisher,
    documentVersion:item.source.documentVersion, reviewedOn:item.source.reviewedOn,
    sourceUrl:item.source.url || null, jurisdictions:item.source.jurisdictions.slice(),
    kind:item.source.kind, rights:item.source.rights, passageId:item.passage.id,
    heading:item.passage.heading, text:item.passage.text, sha256:item.passage.sha256,
    score, status:pack.audience === 'synthetic_demo' ? 'synthetic_example_only' : 'untrusted_reference_excerpt',
    limitations:['Not a verified electrical code interpretation or professional diagnosis.',
     'Check current jurisdiction, edition, source context and site conditions before use.']
   }));
  }
  function citation(id) {
   if (typeof id !== 'string' || !ID.test(id)) throw Error('Invalid passage citation');
   const item = indexed.find(entry => entry.passage.id === id);
   if (!item) return null;
   return Object.freeze({passage:Object.freeze({...item.passage}), source:Object.freeze({...item.source})});
  }
  return Object.freeze({manifest:Object.freeze({schema:pack.schema, id:pack.id, version:pack.version,
   audience:pack.audience, builtOn:pack.builtOn, sourceCount:pack.sources.size, passageCount:pack.passages.length}), search,citation});
 }
 return Object.freeze({SCHEMA, MAX_PASSAGES, verifyPack, digest, openPack});
});
