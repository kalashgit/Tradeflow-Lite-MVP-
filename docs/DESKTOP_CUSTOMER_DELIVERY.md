# TradeFlow Core — First downloadable desktop build (candidate)

This package runs the current TradeFlow app locally. It does **not** require the Cloudflare preview site to open the interface. It is an early, **unsigned** Windows/macOS delivery candidate, not an audited production installer. Windows and macOS may show security warnings because the packages are not code-signed/notarized.

## Installation
- **Windows:** Download the `TradeFlow-Core-Windows-*.exe` portable build and run it. No web URL is required to launch it.
- **macOS:** Extract `TradeFlow-Core-macOS-*.zip`, then move TradeFlow Core into Applications. An unsigned build may be blocked by Gatekeeper; complete Apple signing and notarization before general release.
- Internet access is optional for *local records and navigation*. Live maps, speech recognition and AI/research features may need an internet connection and are not fully validated in this package.
- Local records are stored in the installed application's Electron browser profile, tied to a stable loopback origin. The application never needs Cloudflare merely to open.

## Data safety: backup and restore
1. In TradeFlow open **More → Data & Storage → Export backup**.
2. Save the downloaded `.json` file in a location you control, ideally on a second device or drive.
3. To test recovery, create **fictional** test records, export a backup, and restore it in a **separate clean test installation/profile**.
4. Under **Restore backup**, select the file, review the record count and replacement warning, and approve.
5. Confirm the record counts and actual customer/job/task/quote contents after restore.

**Warning:** Backup JSON is **unencrypted**. Do not store confidential business data in public/shared locations. Restore **replaces all existing local records** and cannot merge them. Treat this early distribution as a technical pilot until backup recovery is independently tested on real Windows/macOS devices.

## Scope and limits
- This does **not** include customer identity/licensing, hosted sync, team access, customer-controlled cloud backend, data encryption at rest or guaranteed offline speech recognition.
- The app's local customer/job/task/quote workflows should be verified on the target device before collecting real customer data.
- Maps and geocoding depend on external services.
- Optional Cloudflare services remain separate. Bring-your-own-cloud requires a deployable server and sync protocol and is **not included** in this build.
- **iPhone/iPad:** desktop packages cannot install there. A signed native iOS app or PWA distribution is a separate release.
- Release builds should be signed, versioned, checked for security, tested with clean installs, and have a support and update plan before payment.

## Build
GitHub Actions workflow: `.github/workflows/package-tradeflow-desktop.yml`. It assembles `desktop/public` using the repo's `public` assets into a local Electron container and uploads the unsigned installer files as workflow artifacts. Download from the successful workflow run's **Artifacts** section.

Do not distribute development previews or promises of feature completion as production licenses.
