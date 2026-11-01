# Verification and Delivery
- Existing UI first: update the actual TradeFlow AI conversation, not a replacement chat or Twilio integration.
- Preserve responsive iPhone layout, keyboard, scroll, contrast, citations, model-mode labels and accessible controls.
- Keep PWA index asset URLs and service worker precache synchronized; test offline reload.
- Verify with npm test, npm run test:storage, npm run test:contractors, npm run test:browser and specialized Chromium/worker tests defined by repo. Do not assume counts.
- Require exact-commit GitHub Actions after publication; inspect job steps/logs and artifacts. A failure in an unrelated Cloudflare build is not a green deploy.
- Private previews: bind localhost, ephemeral access code, private forwarded port, synthetic-only test data; never publish access codes in Git commits or logs.
- Distinguish CI Chromium screenshot from physical iPhone evidence. H03 real two-device revocation and interrupted-ack scenarios remain blocked until approved setup.
