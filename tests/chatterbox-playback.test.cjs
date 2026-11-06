const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../public/voice-output.js');
const validResponse = () => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'audio/wav' }), blob: async () => new Blob([Buffer.alloc(44)]) });
function harness(fetchImpl = async () => validResponse(), playFn = async () => {}) {
  const statusNodes = [{ textContent: '' }], stopButtons = [{ disabled: true }];
  const doc = { visibilityState: 'visible', listeners: {}, addEventListener(k, fn) { this.listeners[k] = fn; }, querySelectorAll(s) { return s.includes('voice-status') ? statusNodes : stopButtons; } };
  const win = { listeners: {}, addEventListener(k, fn) { this.listeners[k] = fn; } };
  const audios = []; const revoked = [];
  const voice = create({ documentRef: doc, windowRef: win, fetchImpl,
    audioFactory: url => { const audio = { url, paused: false, play: playFn, pause() { this.paused = true; }, currentTime: 0 }; audios.push(audio); return audio; },
    urlAPI: { createObjectURL: () => 'blob:voice', revokeObjectURL: value => revoked.push(value) } });
  return { voice, doc, win, audios, revoked, statusNodes, stopButtons };
}
const args = { code: 'not-a-real-secret', text: 'One approved estimate.', turnId: 'turn-1', speechReceipt: '1765000000.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
test('speech from committed text routes to one same-origin endpoint, and stop revokes audio', async () => {
  let request;
  const h = harness(async (path, init) => { request = { path, init }; return validResponse(); });
  assert.equal((await h.voice.speak(args)).status, 'speaking');
  assert.equal(request.path, '/api/ai/tts');
  assert.deepEqual(JSON.parse(request.init.body), { code: args.code, text: args.text, profileId: 'gentleman', speechReceipt: args.speechReceipt });
  assert.equal(h.voice.status(), 'speaking');
  h.voice.stop();
  assert.equal(h.audios[0].paused, true);
  assert.deepEqual(h.revoked, ['blob:voice']);
});
test('supports Matriarch and delayed gesture-required playback', async () => {
  let first = true;
  const h = harness(undefined, () => { if (first) { first = false; return Promise.reject(Error('gesture')); } return Promise.resolve(); });
  assert.equal(h.voice.select('matriarch'), true);
  assert.equal((await h.voice.speak(args)).status, 'ready');
  assert.equal((await h.voice.speak(args)).status, 'speaking');
  assert.equal(h.voice.selectedProfile(), 'matriarch');
  h.doc.visibilityState = 'hidden'; h.doc.listeners.visibilitychange();
  assert.equal(h.voice.status(), 'idle');
});
test('stale response cannot resurrect interrupted playback or change voices', async () => {
  let complete;
  const h = harness(() => new Promise(r => { complete = r; }));
  const pending = h.voice.speak(args);
  h.voice.select('matriarch');
  complete(validResponse());
  assert.equal((await pending).status, 'stopped');
  assert.equal(h.audios.length, 0);
});
test('fail closed without preview credential or on invalid MIME type', async () => {
  let called = 0;
  const h = harness(async () => { called++; return { ...validResponse(), headers: new Headers({ 'Content-Type': 'text/html' }) }; });
  assert.equal((await h.voice.speak({ ...args, code: '' })).status, 'unavailable');
  assert.equal(called, 0);
  assert.equal((await h.voice.speak(args)).status, 'unavailable');
  assert.match(h.voice.statusText(), /Invalid speech response/);
});
