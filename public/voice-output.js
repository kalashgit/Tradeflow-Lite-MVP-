/* TradeFlow AI spoken replies. Speech reads the existing committed text only. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.TradeFlowVoiceOutput = api.create({
    documentRef: root.document, windowRef: root, fetchImpl: root.fetch.bind(root),
    audioFactory: url => new root.Audio(url), urlAPI: root.URL
  });
})(typeof globalThis === 'object' ? globalThis : null, function () {
  'use strict';
  const PROFILES = ['gentleman', 'matriarch'];
  function create({ documentRef, windowRef, fetchImpl, audioFactory, urlAPI }) {
    let profileId = 'gentleman', state = 'idle', message = 'Voice standby',
      epoch = 0, current = null, audio = null, controller = null, objectURL = null;
    function notify() {
      for (const label of documentRef?.querySelectorAll?.('[data-tf-voice-status]') || []) label.textContent = message;
      for (const button of documentRef?.querySelectorAll?.('[data-action="tfAiVoiceStop"]') || []) {
        button.disabled = state === 'idle' || state === 'unavailable';
      }
    }
    function setState(next, detail) { state = next; message = detail; notify(); }
    function releaseAudio() {
      if (audio) {
        audio.onended = audio.onerror = null;
        try { audio.pause(); audio.currentTime = 0; } catch (_) { /* detached audio */ }
        audio = null;
      }
      if (objectURL) { urlAPI.revokeObjectURL(objectURL); objectURL = null; }
    }
    function stop() {
      epoch++;
      if (controller) { controller.abort(); controller = null; }
      releaseAudio(); current = null;
      setState('idle', 'Voice stopped');
    }
    function select(id) {
      if (!PROFILES.includes(id)) return false;
      if (profileId !== id) stop();
      profileId = id;
      return true;
    }
    async function playReady(token) {
      if (token !== epoch || !audio) return { status: 'stopped' };
      const candidate = audio;
      try {
        await candidate.play();
        if (token !== epoch || audio !== candidate) return { status: 'stopped' };
        setState('speaking', 'Speaking · ' + (profileId === 'gentleman' ? 'The Gentleman' : 'The Matriarch'));
        return { status: 'speaking' };
      } catch (_) {
        if (token !== epoch) return { status: 'stopped' };
        setState('ready', 'Audio ready · tap Listen again to play');
        return { status: 'ready', reason: 'Playback requires a tap' };
      }
    }
    async function speak({ text, code, turnId, speechReceipt } = {}) {
      if (state === 'ready' && current === turnId && audio) return playReady(epoch);
      stop();
      if (typeof text !== 'string' || !text.trim() || text.length > 2500 || !code || !turnId || typeof speechReceipt !== 'string') {
        setState('unavailable', 'Speech unavailable for this reply');
        return { status: 'unavailable' };
      }
      const token = epoch;
      current = turnId;
      controller = new AbortController();
      setState('loading', 'Preparing Chatterbox voice…');
      try {
        const response = await fetchImpl('/api/ai/tts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, text, profileId, speechReceipt }),
          cache: 'no-store', signal: controller.signal
        });
        if (token !== epoch) return { status: 'stopped' };
        if (!response.ok) throw Error('Chatterbox is not available (' + response.status + ')');
        if (!/^audio\/wav(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '')) throw Error('Invalid speech response');
        const blob = await response.blob();
        if (token !== epoch) return { status: 'stopped' };
        if (blob.size < 44 || blob.size > 10 * 1024 * 1024) throw Error('Invalid audio size');
        controller = null;
        objectURL = urlAPI.createObjectURL(blob);
        audio = audioFactory(objectURL);
        const candidate = audio;
        candidate.onended = () => {
          if (token !== epoch || candidate !== audio) return;
          releaseAudio(); current = null;
          setState('idle', 'Speech finished');
        };
        candidate.onerror = () => {
          if (token !== epoch || candidate !== audio) return;
          releaseAudio(); current = null;
          setState('unavailable', 'Audio playback failed');
        };
        setState('ready', 'Audio ready');
        return playReady(token);
      } catch (error) {
        if (token !== epoch) return { status: 'stopped' };
        releaseAudio(); controller = null; current = null;
        setState('unavailable', error.message || 'Speech service unavailable');
        return { status: 'unavailable' };
      }
    }
    documentRef?.addEventListener?.('visibilitychange', () => {
      if (documentRef.visibilityState === 'hidden') stop();
    });
    windowRef?.addEventListener?.('pagehide', stop);
    return Object.freeze({ speak, stop, select, selectedProfile: () => profileId,
      status: () => state, statusText: () => message, notify });
  }
  return Object.freeze({ create });
});
