# TradeFlow — Chatterbox private voice runtime and preview

**Status:** source integration in draft PR #43; reference recordings, real model-runtime playback, browser/iPhone acceptance and Cloudflare preview **not verified**.

## Exact implementation

- **Primary engine:** [Chatterbox TTS](https://github.com/resemble-ai/chatterbox), MIT-licensed open-source model family. Uses the original English `ChatterboxTTS` with separately supplied reference recordings (not paid API or public HF demo endpoint). Archived/no longer maintained upstream as of August 2026: inspect dependencies and pin an audited version before production.
- **The Gentleman:** mature British male, full resonant baritone, refined, warm, measured authority, dry restrained humour. Chatterbox profile ID `gentleman`; provisional expressiveness `exaggeration=0.57, cfg_weight=0.35`.
- **The Matriarch:** **young-adult British female**, smooth, refined, lower/middle register, not elderly. Chatterbox profile ID `matriarch`; provisional `exaggeration=0.59, cfg_weight=0.35`.
- These profile IDs refer to separately licensed **British English reference recordings**. They are routing IDs, not proof that an actual voice achieves the required accent, age or vocal quality.
- Do **not** imitate an actor, fictional character or individual without permission. Never use commercial client recordings or download third-party voices without checking rights.
- Existing chat thread remains authoritative. A user presses **Listen** on a committed assistant turn, with profile selection and **Stop**. Text is sent without paraphrasing through `/api/ai/tts`; speech has no command/execution rights. Audio is temporary, not saved by default. Stop, thread change and page hide cancel playback.
- Existing `voice-command.js` microphone and command architecture are unchanged. This increment implements **spoken replies only**, not streaming ASR, VAD or full duplex.

## Private model runtime

Install on an isolated Python 3.11 environment with appropriate RAM/accelerator:

```bash
python -m pip install chatterbox-tts
export TF_CHATTERBOX_TOKEN='set-an-independent-random-server-secret-min-16-chars'
export TF_CHATTERBOX_GENTLEMAN_REF='/private-voices/british-gentleman.wav'
export TF_CHATTERBOX_MATRIARCH_REF='/private-voices/british-young-adult-female.wav'
export TF_CHATTERBOX_DEVICE='cpu'  # use cuda only with a compatible secure GPU host
python tts/chatterbox_service.py
```

For **nonproduction voice experiments**, run `python tts/provision_vctk_references.py` from the repository root first. This fetches VCTK CC BY 4.0 samples into `.local-tts/` (never Git), recording source URLs, SHA256 and attribution. The initial candidate references are `./.local-tts/gentleman-vctk.wav` (VCTK p227, 38-year-old male from Cumbria) and `./.local-tts/matriarch-vctk.wav` (VCTK p225, 23-year-old female from Southern England). Set the two `TF_CHATTERBOX_*_REF` environment variables to their **absolute** paths before starting the runtime. Research/candidate use is not commercial voice approval; inspect applicable permissions and maintain the CC BY 4.0 credit. These samples were used for genuine Chatterbox A/B previews, **not** to verify final quality in TradeFlow itself.

Both reference WAVs MUST exist, be appropriately licensed, use natural original English speech, and stay outside Git. Loading Chatterbox weights on first boot may download model files privately into the runtime's HF cache; weights are not included in this PR. No startup is possible without both references. Python process binds `127.0.0.1:8765` by default; the token is required for every route. It never logs text or stores generated WAVs.

The model host must not be public. For a **remote** Cloudflare preview, expose it only through authenticated private TLS ingress with the independent service token; Cloudflare cannot connect to your laptop's `127.0.0.1` address. Ensure the external HTTPS upstream is reachable from the Worker before enabling voice. Check ingress authentication and egress costs.

Cloudflare Worker secrets/configuration:

- `TF_AI_PREVIEW_TOKEN`: **existing** TradeFlow private preview access code
- `TF_CHATTERBOX_URL`: HTTPS base URL of the private model ingress, e.g. `https://private-voice.example.test`. Do not use the example URL literally. HTTP is only permitted for loopback during local development.
- `TF_CHATTERBOX_TOKEN`: separate long independent token, same value on the private Python runtime

The Worker validates preview access, permitted profiles and text size before forwarding. It rejects non-WAV and oversized outputs, disables caching, and returns 503 when the host is not provisioned. Secrets must never be placed in Git, localStorage, logs, model prompts or a browser-visible URL.

## Testing

```bash
python -m unittest discover -s tts -p 'test_*.py' -v
node --test tests/voice-profile-contract.test.cjs tests/chatterbox-gateway.test.cjs tests/chatterbox-playback.test.cjs
npm test
npm run test:browser
```

The Python tests use a fake WAV-generating engine to validate authentication and the local HTTP path. JavaScript tests use fake requests/audio. They **do not** prove real Chatterbox inference or actual iPhone audio.

Once the private runtime exists, open TradeFlow AI in the **isolated preview**, unlock with the existing access code, submit a synthetic question, choose The Gentleman or The Matriarch, and tap Listen on its saved assistant reply. Tap Stop to interrupt. If iOS blocks automatic playback after synthesis, tap Listen again. The controls must never claim speech is available while the backend returns 503.

## Acceptance gates still open

1. Provide original licensed British reference recordings for both profiles; log license, duration, clipping and consent.
2. Pin downloaded `chatterbox-tts` package version, its dependencies, model revision, license/hashes and GPU/CPU/RAM/first-byte latency. Generate genuine clips from both references for human A/B approval.
3. Provision a reachable, separately authenticated private HTTPS model host. Confirm no user/customer text reaches public Hugging Face Spaces.
4. Test synthesized voice in the **actual** TradeFlow preview, including a 390px mobile browser, real iPhone Safari/PWA user gesture, Stop, interruption during inference, after page hide, and offline text fallback.
5. Run full exact-commit CI and independently check deployment preview. No production deployment/merge without authorization.

No automatic assistant speech or background microphone capture occurs in this change. No business actions can be triggered by the audio output path.

## Signed speech binding and Cloudflare preview isolation (2026-11-06)

- Only the `/api/ai/chat` server may mint a short-lived (30-minute) HMAC receipt for the exact generated assistant text using the **private** `TF_CHATTERBOX_TOKEN`. The client stores that receipt with the committed local assistant turn. `/api/ai/tts` verifies the original text and receipt before forwarding to the model; unauthorized, modified, expired and locally generated replies are rejected. Old unsigned turns remain visible but do **not** expose Listen.
- `wrangler.jsonc` includes a preview-only `previews` block (separate identity placeholders, AI binding, **no production D1 binding**). This was added because the Cloudflare build logs reported `Your Wrangler configuration is missing a previews block` for the previous revision. A new Preview build still requires verification; a preview without an isolated D1 does not support authenticated tenant-record API workflows.
- Production deployment and production D1 are not authorized. `TF_AI_PREVIEW_TOKEN` and `TF_CHATTERBOX_TOKEN` are configured as secrets, never placed in Git. A reachable private HTTPS Chatterbox model host is required; the preview must report 503 when unavailable.
- Hugging Face Sandbox creation was attempted for a temporary isolated Chatterbox runtime and returned HTTP **402 Payment Required**; no billable environment was created. Official HF Chatterbox Space generated genuine candidate clips, but it is public experimentation and **must not be used for customer data or wired to TradeFlow**.
- Exact-head CI includes `tests/speech-receipt.test.cjs` and `tests/voice-saved-receipt.test.cjs`; model inference, audible mobile preview, performance and physical iPhone remain open acceptance gates.
