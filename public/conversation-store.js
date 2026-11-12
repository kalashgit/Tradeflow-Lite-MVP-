/* Versioned, device-local TradeFlow AI conversation history.
   This store has no cloud sync, model authority, or business command side effects. */
(function(root, factory) {
 const api = factory();
 if (typeof module === 'object' && module.exports) module.exports = api;
 if (root) root.TradeFlowConversationStore = api;
})(typeof globalThis === 'object' ? globalThis : null, function() {
 'use strict';
 const VERSION = 10;
 const THREADS = 'aiConversationThreads';
 const TURNS = 'aiConversationTurns';
 const ROLES = new Set(['user', 'assistant', 'system_notice']);
 const SOURCES = new Set(['user', 'user_scenario', 'financial_missing_data', 'synthetic_mock', 'local_qwen', 'general_advice', 'genesis_qwen', 'genesis_reference', 'genesis_unavailable', 'model_unavailable', 'unverified_model', 'device_local_evidence', 'academy_metadata', 'offline_knowledge', 'system_notice']);
 const MODALITIES = new Set(['text', 'voice']);
 const now = () => new Date().toISOString();
 const makeId = () => crypto.randomUUID();
 function scopeKey(scope) {
  if (!scope || typeof scope !== 'object' || !['local', 'verified_account'].includes(scope.kind) ||
      ![scope.businessId, scope.actorId].every(x => typeof x === 'string' && /^[A-Za-z0-9:_@.\-|]{1,180}$/.test(x))) {
   throw Error('A valid actor and business scope is required for conversation history');
  }
  return JSON.stringify([scope.kind, scope.businessId, scope.actorId]);
 }
 function upgrade(db) {
  if (!db.objectStoreNames.contains(THREADS)) {
   const threads = db.createObjectStore(THREADS, {keyPath: 'id'});
   threads.createIndex('byScope', 'scopeKey', {unique: false});
  }
  if (!db.objectStoreNames.contains(TURNS)) {
   const turns = db.createObjectStore(TURNS, {keyPath: 'id'});
   turns.createIndex('byThread', 'threadId', {unique: false});
  }
 }
 function transaction(db, stores, mode, work) {
  return new Promise((resolve, reject) => {
   let result, failure;
   let tx;
   try {
    tx = db.transaction(stores, mode);
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(failure || tx.error || Error('Conversation transaction failed'));
    work(tx, value => {result = value}, error => {failure = error; tx.abort()});
   } catch (error) { reject(error) }
  });
 }
 function ensureThread(row, key, fail) {
  if (!row || row.scopeKey !== key || row.deletedAt) {
   fail(Error('Conversation is unavailable in this local workspace'));
   return false;
  }
  return true;
 }
 const CITATION_HOSTS = new Set(['osha.gov','sba.gov','dol.gov','irs.gov','bls.gov',
   'energycodes.gov','afdc.energy.gov','nfpa.org','sam.gov','apprenticeship.gov','csrc.nist.gov']);
 function isApprovedCitation(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' ||
      !/^tf-[A-Za-z0-9_-]{1,110}$/.test(c.id) || typeof c.title !== 'string' ||
      !c.title.trim() || c.title.length > 180 || typeof c.url !== 'string' ||
      c.url.length > 700) return false;
  try { const url = new URL(c.url);
   return url.protocol === 'https:' && !url.username && !url.password &&
      CITATION_HOSTS.has((url.hostname.startsWith('www.') ? url.hostname.slice(4) : url.hostname));
  } catch { return false }
 }
 function sanitizeTurn(value) {
  if (!value || typeof value !== 'object' || !ROLES.has(value.role) ||
      !MODALITIES.has(value.modality || 'text') || value.status !== 'committed' ||
      typeof value.content !== 'string' || !value.content.trim() || value.content.length > 6000 ||
      !SOURCES.has(value.source) || !['user', 'system_notice'].includes(value.role) && value.source === 'user' ||
      (value.role === 'user' && value.source !== 'user') || value.audio || value.rawAudio) {
   throw Error('Only bounded, final, text-only conversation turns may be saved');
  }
  if (value.id != null && (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value.id))) throw Error('Invalid turn event ID');
  const refs = value.refs == null ? [] : value.refs;
  if (!Array.isArray(refs) || refs.length > 8 || refs.some(x => typeof x !== 'string' || !/^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+@[0-9]+$/.test(x))) throw Error('Invalid evidence references');
  if (value.role === 'user' && refs.length) throw Error('User turns cannot assert verified evidence');
  const citations = value.citations == null ? [] : value.citations;
  if (!Array.isArray(citations) || citations.length > 8 || citations.some(c => !isApprovedCitation(c)) ||
      (citations.length && (value.role !== 'assistant' ||
       !['genesis_qwen','genesis_reference'].includes(value.source))))
   throw Error('Invalid source citation for read-only Genesis knowledge');
  const cleanCitations = citations.map(c=>({id:c.id,title:c.title.trim(),url:c.url}));
  return {id: value.id || makeId(), role: value.role, content: value.content.trim(), modality: value.modality || 'text',
   status: 'committed', source: value.source, refs: refs.slice(), citations:cleanCitations, at: now()};
 }
 function createThread(db, scope, title = 'New conversation') {
  const key = scopeKey(scope);
  const name = String(title || 'New conversation').trim().slice(0, 80) || 'New conversation';
  const time = now();
  const thread = {id: makeId(), scopeKey: key, title: name, createdAt: time, updatedAt: time,
   revision: 1, lastMessageId: null, syncState: 'local_only', deletedAt: null};
  return transaction(db, [THREADS], 'readwrite', (tx, finish) => {
   tx.objectStore(THREADS).add(thread);
   finish(thread);
  });
 }
 function listThreads(db, scope) {
  const key = scopeKey(scope);
  return transaction(db, [THREADS], 'readonly', (tx, finish) => {
   const request = tx.objectStore(THREADS).index('byScope').getAll(key);
   request.onsuccess = () => finish(request.result.filter(x => !x.deletedAt).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)));
  });
 }
 function listTurns(db, scope, threadId) {
  const key = scopeKey(scope);
  return transaction(db, [THREADS, TURNS], 'readonly', (tx, finish, fail) => {
   const request = tx.objectStore(THREADS).get(threadId);
   request.onsuccess = () => {
    if (!ensureThread(request.result, key, fail)) return;
    const turns = tx.objectStore(TURNS).index('byThread').getAll(threadId);
    turns.onsuccess = () => finish(turns.result.filter(x => x.scopeKey === key)
     .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)));
   };
  });
 }
 function appendTurn(db, scope, threadId, turn) {
  const key = scopeKey(scope), input = sanitizeTurn(turn);
  return transaction(db, [THREADS, TURNS], 'readwrite', (tx, finish, fail) => {
   const threads = tx.objectStore(THREADS), turns = tx.objectStore(TURNS);
   const request = threads.get(threadId);
   request.onsuccess = () => {
    const thread = request.result;
    if (!ensureThread(thread, key, fail)) return;
    const prior = turns.get(input.id);
    prior.onsuccess = () => {
     if (prior.result) {
      const existing = prior.result;
      if (existing.threadId !== threadId || existing.scopeKey !== key || existing.role !== input.role ||
          existing.modality !== input.modality || existing.content !== input.content ||
          existing.source !== input.source || JSON.stringify(existing.refs) !== JSON.stringify(input.refs) ||
          JSON.stringify(existing.citations||[]) !== JSON.stringify(input.citations)) {
       fail(Error('Conflicting conversation event ID')); return;
      }
      finish(existing); return;
     }
     const record = {...input, scopeKey: key, threadId, order: thread.revision};
     turns.add(record);
     threads.put({...thread, updatedAt: record.at, revision: thread.revision + 1, lastMessageId: record.id});
     finish(record);
    };
   };
  });
 }
 function deleteThread(db, scope, threadId) {
  const key = scopeKey(scope);
  return transaction(db, [THREADS, TURNS], 'readwrite', (tx, finish, fail) => {
   const threads = tx.objectStore(THREADS), turns = tx.objectStore(TURNS);
   const request = threads.get(threadId);
   request.onsuccess = () => {
    if (!ensureThread(request.result, key, fail)) return;
    const cursor = turns.index('byThread').openCursor(threadId);
    cursor.onsuccess = () => {
     if (cursor.result) {
      if (cursor.result.value.scopeKey !== key) {fail(Error('Conversation scope mismatch')); return}
      cursor.result.delete();
      cursor.result.continue();
     } else {
      threads.delete(threadId);
      finish(true);
     }
    };
   };
  });
 }
 return Object.freeze({VERSION, THREADS, TURNS, scopeKey, upgrade, sanitizeTurn, createThread,
  listThreads, listTurns, appendTurn, deleteThread, isApprovedCitation});
});
