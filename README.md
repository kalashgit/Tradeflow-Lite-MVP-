# TradeFlow permanent deployment kit

This kit contains the v0.4 static app inside `public/` and a Wrangler config.

1. Create a **private** GitHub repository, upload these files preserving the directory structure, and open a Codespace on its main branch.
2. Check Cloudflare dashboard for the **exact Worker name** you want to keep. Replace `REPLACE_WITH_EXISTING_WORKER_NAME` in `wrangler.jsonc` with that name. Do not guess.
3. In the Codespaces terminal run `npm install` then `npx wrangler login` and complete Cloudflare authorization in your browser. Run `npx wrangler whoami` to verify the account.
4. **Backup the existing local app records** using Settings > Export. Make sure the backup is saved to Files before deploying.
5. Run `npx wrangler deploy`. Check the output shows the intended Worker name and URL.
6. Open the existing Worker URL and verify the app, then test the installed iPhone Home Screen app. The service worker may initially show a cached version.

For subsequent releases, replace files in `public/` and rerun `npx wrangler deploy`. Keep the Worker name unchanged. Commit changes to GitHub first for version history.

Caution: data in IndexedDB is origin-scoped. Deploying to the same workers.dev origin normally preserves it, but app updates, storage clearing, or bugs can still cause data loss. Keep backups. If your app was deployed under a different Worker URL, the data will not transfer automatically.
