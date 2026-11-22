# Daylight — Private Day One `.doentry` Journal PWA

A 100% free, privacy-first Day One clone for reading, searching, and editing `.doentry` journal files stored in Google Drive — installable as a PWA on both **macOS** and **Google Pixel (Android)**.

## Features
- **Direct `.doentry` Google Drive Sync:** Reads and writes Apple XML Property List (`.doentry`) files directly in Google Drive, preserving all existing Day One / Journaley metadata (`Location`, `Weather`, `Creator`, `Activity`, `Time Zone`, etc.) losslessly.
- **Auto-detects Folder Structure:** Automatically supports both standard Day One / Journaley layouts (`entries/*.doentry` + `photos/` or `Journal.dayone/entries/`) and flat `.doentry` folders.
- **Instant Full-Text Search:** Caches entries locally in IndexedDB and syncs incrementally, making multi-word search across a decade of entries instant with match highlighting.
- **On This Day:** Browse entries written on today's date (or any date) across past years.
- **Create Entries, Photos, Tags, Stars & Calendar:** Full entry creation/editing (`Cmd/Ctrl+S`), photo viewing & uploading to `photos/<UUID>.jpg`, tag management, favorites, and an interactive monthly calendar browser.
- **Demo Mode & Local `.doentry` Import:** Try the full app immediately before connecting Google Drive.

## Run Locally
```bash
npm install
npm run dev
```
Open `http://localhost:5173` in Chrome or Safari.

## One-Time Free Google Cloud Setup (~5 min)
1. Go to [Google Cloud Console](https://console.cloud.google.com/) (free, no billing required) and create a project (e.g. `My Journal`).
2. Under **APIs & Services → Library**, search for **Google Drive API** and click **Enable**.
3. Under **Google Auth Platform → Audience** (or *OAuth consent screen*), select **External**, leave it in **Testing** mode, and add your own Gmail address under **Test users**.
4. Under **Clients → Create Client → Web application**, add your **Authorized JavaScript origins**:
   - `http://localhost:5173` (for local testing)
   - Your free deployment URL (e.g. `https://<username>.github.io` or `https://<project>.pages.dev`)
5. Copy the **Client ID**, open **Settings & Drive** in Daylight, paste it in, and click **Connect & Sync Google Drive**.

## Deploy for Free (Access on macOS & Google Pixel)
Build the static site:
```bash
npm run build
```
Deploy the `dist/` folder for free on **Cloudflare Pages**, **Netlify**, or **GitHub Pages** (remember to add your deployed `https://...` origin to your Google Cloud OAuth Client's Authorized JavaScript origins).

- **On Google Pixel (Chrome):** Open your deployed URL → tap the menu (`⋮`) → **Install app**.
- **On macOS (Chrome or Safari):** Open your deployed URL → click the install icon in the address bar (or Safari **File → Add to Dock**).
