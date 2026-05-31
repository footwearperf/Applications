# FootJoy Vision (web app)

Mobile-first Progressive Web App for auditing FootJoy retail displays. Sign in,
pick a store, choose a fixture, photograph it, and the app scores it against that
fixture's merchandising criteria. Built with plain HTML/CSS/JS; the backend is
Supabase (database, storage, and an Edge Function that calls Claude for scoring).

## Files
- `index.html` — the app shell
- `styles.css` — styling (FootJoy Curate palette)
- `app.js` — the screen flow (sign in, account, fixture, capture, review, history)
- `supabaseClient.js` — talks to Supabase (uses the public publishable key only)
- `db.js` — offline queue (IndexedDB)
- `service-worker.js` / `manifest.json` — installable / offline support
- `icon-*.png` — app icons

## Hosting on GitHub Pages
1. Create a new repository and upload all of these files to its root.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   pick your branch (e.g. `main`) and folder `/ (root)`, then **Save**.
3. After a minute the app is live at `https://<your-username>.github.io/<repo>/`.
   Open that URL on a phone and use the browser's **Add to Home Screen**.

## After it's live (optional hardening)
- In Supabase → Edge Functions → Secrets, set `ALLOWED_ORIGIN` to your Pages URL
  (e.g. `https://<your-username>.github.io`) to lock the scoring function to this app.

Notes: the app needs HTTPS (GitHub Pages provides it) for the camera and install
to work. It talks only to the FootJoy Supabase project; no secrets live in these files.
