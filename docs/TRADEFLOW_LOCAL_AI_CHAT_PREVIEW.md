# TradeFlow local AI — existing conversation interface preview (synthetic)

**Status:** development-only, not merged/deployed. This is the **existing** TradeFlow Intelligence chat page and in-app assistant surface, NOT Twilio and NOT a new chat application. The mock path is deterministic, and a real Qwen call is separately opt-in.

## Architecture

Browser -> existing TradeFlow AI form and `/api/ai/chat` -> **Codespace-local development server** -> actual H04-01 `readIntelligenceContext` with a fixed synthetic tenant/verified synthetic principal -> `briefFromAuthorizedSource` -> `briefAuthorizedContext` -> mock/localhost Qwen -> new H04-01 read to reverify actor, role and source revisions -> answer + whitelisted exact refs -> existing chat bubbles and read-only evidence labels.

**Hard boundaries**
- No live OIDC identity, customer records, production D1, outbound messages, database writers or commands are attached to the synthetic server.
- The client may submit a question but cannot choose its tenant, actor, role or evidence. Browser-provided `business` totals are intentionally ignored by the synthetic server.
- Fixed test-record provenance is versioned and validated. Model suggestions are untrusted and not business commands.
- Models never run in the browser or receive provider credentials. Calls are loopback-only between server and localhost Qwen.
- Revoke/change evidence during inference -> discard returned answer. Qwen down/timeout/truncation -> visibly unavailable, not a fabricated model answer.
- Preview code is random per server launch unless explicitly set via local environment; the HTTP port binds to loopback. Keep Codespaces forwarded port **PRIVATE** and do not put the code in GitHub, CI logs, screenshots or customer records.
- Existing Cloudflare `/api/ai/chat` deployment is unchanged; the preview host is a separate opt-in script and is not production authentication.

## Run from the current TradeFlow Codespace

```sh
cd /workspaces/Tradeflow-Lite-MVP-
git fetch origin feature/cloud-record-discovery
git merge --ff-only origin/feature/cloud-record-discovery
node --test tests/local-ai-*.test.cjs
node scripts/local-ai-preview-server.cjs
```

Default model mode is `mock`; no Qwen is needed for the UI demonstration. The terminal displays a temporary **private access code**. Codespaces automatically detects port **4188**. From the **Ports** tab, ensure the forwarded port is **Private**, then open the forwarded URL while signed into the authorized GitHub account. Navigate to **TradeFlow AI** inside the existing application, enter the temporary code and ask: "What should I prioritize today to improve profitability?"

The assistant must show `SYNTHETIC · MOCK`, an explicit uncertain/cash-vs-profit explanation and evidence such as `invoices:synthetic_invoice_01@1`. No records are changed. The preview can be closed with Ctrl+C.

**Real Qwen mode** (only if llama.cpp's model server is confirmed healthy on the SAME Codespace and has sufficient RAM):

```sh
TF_AI_DEV_MODEL=live node scripts/local-ai-preview-server.cjs
```

This calls `http://127.0.0.1:8088` through the existing local provider. When Qwen is unready or terminated, the chat instead shows a clear **MODEL UNAVAILABLE** response; the synthetic demo remains usable in mock mode. Never call a remote or public model endpoint.

**Simulate unavailable state, without Qwen:**

```sh
TF_AI_DEV_MODEL=unavailable node scripts/local-ai-preview-server.cjs
```

## Acceptance

```sh
node --test tests/local-ai-provider.test.cjs tests/local-ai-briefing.test.cjs tests/local-ai-context-bridge.test.cjs tests/local-ai-preview-server.test.cjs
node scripts/verify-local-ai-authorized-source.cjs --mock
node scripts/verify-local-ai-chat-browser.cjs
```

The Chromium script checks the **existing** TradeFlow AI chat page at mobile and desktop viewports and writes synthetic screenshot artifacts under `artifacts/local-ai-conversation/`. It must run in an environment with Playwright's Chromium installed (existing TradeFlow CI uses it).

### Limits and next engineering gates

This is NOT a signed-in production-tenant-to-model integration. The synthetic principal and database are a **test stand-in**; the real system must use the existing server-enforced identity and authorized context path (and account revocation checks) in a separately approved isolated environment. Do not expose the synthetic server as if it were an authenticated, real-business application.

For the November 13 prototype: restore stable Qwen model loading; verify live Qwen output for the actual synthetic chat journey, memory/latency and thermal/cpu tradeoffs; develop typed draft proposals via existing command/approval service; execute full exact-commit Node, storage, contractor and Chromium regression; perform private iPhone acceptance without production deployment.

**No production deployment, migration, PR merge or live financial/customer action is authorized.**
