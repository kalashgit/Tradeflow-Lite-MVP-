# X01 correction sprint — source and safety handoff

## Immutable base and integrated source
Integration parent: `972ba2e327b4ec04cce1aeb2dee13abdd6449b1a`, descendant of frozen `e74f5655dc5ab36400b353723c5e0f90021ad330`.

- T01 PR #70: `5eeaa9d5440c40ac87c961fd623c5e19ff53cae7` — strict Gregorian dates, isolated synthetic application module / oracle checks, fail-closed state replay
- I01 PR #71: `c4c6a63041c36b3e5133a22d4e544e9ee1f93de3` — pure read-only financial source, date and obligation gate; *not* authentication
- G02 PR #73: `b3590168e0c5e16fff71e16d2066fab2a66ce778` — pinned original Concept B GIF -> 60-frame MP4/GIF build with manifest checksum
- G02 PR #75: `a08eb1eddfeaa017332e0737b22563b0bc6b0d62` — truthful permission/listening/stop lifecycle; its newer G02 workflow wins the overlap with #73
- D01 PR #77: `d3e2914eb7f225344c7822e34b99cee8f093517d` — authenticated, read-only server record *inventory*, with availability and liability coverage explicitly missing

## Conflict and ownership reconciliation
- `public/app.js`: X01-only, preserves existing `tfAISend(text,{modality})`, `sendConversation`, scoped IndexedDB thread and 6000-character contract. Unbound owner job/payroll queries are saved into the same thread as `financial_missing_data`; the app neither requests tenant evidence nor asserts that bank funds are verified.
- `.github/workflows/g02-orb-compact-validation.yml`: choose G02 #75's current file; include G02 #73's checked-source packaging script.
- `public/intelligence-payroll-risk.js`: I01 #71 patch applies cleanly because its parent blob matches frozen X01.
- `src/tenant-api.js`: D01 #77 patch applies cleanly because the underlying shared base blob matches X01.
- T01 simulator remains under `automation/simulator/**` and its isolated tests. No browser/tenant fixture importer, model oracle or production data adaptation was added.
- S01 private Access guard PR #74 remains a separate non-deploying infrastructure review; existing private preview route and access policy are untouched.

## Trust separation
I01 v1 scenario numbers are whole-dollar demonstration values; D01 packet uses `minor_cents` and has `cash.availableMinor:null`, `obligationsComplete:false` and `executionAuthority:false`. These are **not the same evidence contract**; do not convert D01 inventory into I01 `authorization.verified` via user/model fields or mark real cash risk calculated. Future binding requires server-issued principal, scoped thread/job, accurate units, strict revision, bank settlement and complete liabilities. The model, frontend and simulator cannot confer verified-record status.

No automatic command, approval, invoice, customer contact, tenant write, production deployment or merge is authorized.

## Mandatory exact-head checks
```sh
npm ci --no-audit --no-fund
bash scripts/build-welcome-orb-media.sh # requires ffmpeg, ffprobe, approved matching reference/manifest
npm test
node --test tests/intelligence-financial-evidence.test.cjs tests/financial-evidence-api.test.cjs tests/x01-missing-financial-bridge.test.cjs
npm run test:storage
npm run test:contractors
T01_APP_FINANCIAL_MODULE="$PWD/public/intelligence-financial-evidence.js" node --test tests/t01-i01-evidence-gate.test.cjs
T01_APP_PAYROLL_MODULE="$PWD/public/intelligence-payroll-risk.js" node --test tests/t01-application-fixture.test.cjs
node automation/simulator/evaluate.cjs
node scripts/verify-orb-compact-browser.cjs
node scripts/verify-tf64-owner-journey-browser.cjs
```

This document records the source composition, not a claim of executed combined-head tests. Inspect the linked X01 exact-head CI run and screenshot/trace artifacts after it completes. Full Node, authorization, physical iPhone/VoiceOver and actual real-world payroll truth require independent Q01 review. A T01 owner parser source pin against the *old frozen payroll file* may intentionally report `APP_NOT_RUN` after the I01 update; do not label it passed on new source until repinned and independently reviewed.
