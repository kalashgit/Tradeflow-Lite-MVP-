# Voice-reactive Flow Wave

The four existing ribbons now respond to actual microphone samples, independently of speech recognition and command execution. No panel layout, artwork paths, business logic, records or schema changed.

## Signal and motion

`flow-wave-audio.js` opens an additional local microphone stream during listening, connects it to a Web Audio analyser (1024 samples), and measures RMS plus low (85–350 Hz), mid (350–1800 Hz) and high (1800–4000 Hz) energy. A noise gate and logarithmic gain handle ordinary volume differences. A 55 ms attack and 220 ms release envelope follow syllables and pauses without rapid jitter. Four bounded transforms modulate ribbon height and drift; the phase advances with measured energy. Silence settles to the reference silhouette. There are no waveform traces or extra ribbon paths.

Metering never connects to speakers, records raw audio, writes storage, or sends audio to a server. The app's existing browser speech recognizer and command handling are unchanged. This does not alter any platform speech-recognition processing.

The controller starts metering in the existing microphone gesture. Stop, close, recognition end/error, page hiding and ended audio tracks release the extra stream and AudioContext. Late permission grants after closing are discarded safely. Unsupported APIs, capture errors and permission failures fall back to the existing state animation without blocking command input. Reduced motion prevents reactive motion and unnecessary metering. The wave is marked `is-audio-reactive` only while real samples drive it. Fallback animation must not be described as voice-reactive.

## Tests and evidence

- `node --test tests/flow-wave-audio.test.cjs tests/flow-wave-art.test.cjs tests/voice-command.test.cjs`: 25 passed.
- Broader focused voice/customer/pilot suite: 44 passed, 0 failed.
- Full suite `node --test tests/*.test.cjs`: 145 passed, 3 pre-existing Map/Opportunity failures (same assertions reproduced on baseline during the ribbon delivery; see FLOW_WAVE_V3_VERIFICATION.md).
- `scripts/verify-flow-wave-audio.cjs` exercises actual Chromium `getUserMedia`, MediaStreamSource and AnalyserNode using a generated synthetic microphone WAV with alternating silence, loud and quiet envelopes. This is controlled test input, not a recording of a human.
- Browser result: ribbon scale ranged from 1.000 to 1.281; silence settled, over 20 distinct transforms occurred, and Stop ended every added microphone track. Screenshots, sampled transforms and the recording are under `/workspace/artifacts/tradeflow-flow-wave/audio/`.
- Repeat: `PLAYWRIGHT_MODULE=/path/to/playwright OUTPUT_DIR=/tmp/flow-audio node scripts/verify-flow-wave-audio.cjs`. `BASE_URL` selects preview. `BROWSER_PROXY` is optional for environments requiring an HTTP proxy. The test uses an isolated browser profile and a settings-only test business; no business records are created.
- Existing preview CI now also syntax-checks the meter and runs its tests and voice-command regressions. Cache URLs are versioned v4 and include the new module for offline use.

## Device limitation

Physical iPhone microphone, Safari, and concurrent native speech recognition plus Web Audio have not been verified here. Browser vendors can restrict simultaneous capture or suspend AudioContext; metering is optional and errors are isolated. Actual recognition accuracy is not measured by this test. Test on the user's iPhone before claiming device compatibility or audio-reactive frame-rate performance. Backgrounding releases the meter; restart listening after returning if the browser kept speech recognition active.
