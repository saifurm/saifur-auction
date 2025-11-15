# Saifur Auction

Full-stack style auction war-room built as a static React app on top of Firebase Firestore. It follows the Stanford/Harvard/Stony Brook crimson palette, runs a hot-reload dev server via Vite, and publishes directly to GitHub Pages.

## Features

- Landing experience with quick access to create/join flows.
- Admin-driven auction creation with category builder (A-E), player lists, budgets, player counts, password, and visibility toggle.
- Lobby with live participant list, shareable password chip, and admin controls to start the auction (plus pause/resume once live).
- Live auction board: timers, pass logic that ends bidding when everyone else is out, pause/resume, budget enforcement, reorganized roster displays, and a queue that shows sold/unsold/up-next players.
- Team confirmation -> ranking -> results pipeline with peer scoring and automatic stage progression.
- Firebase Firestore backend (`auction-9bf14`) for real-time data and persistence.

## Local development (auto-refresh)

1. Install dependencies once:

   ```bash
   npm install
   ```

2. Run the Vite dev server (hot reload + instant preview):

   ```bash
   npm run dev
   ```

   Vite prints a local URL (usually <http://localhost:5173>) plus a network URL you can open from phones/tablets on the same Wi-Fi.

## Configuring Firebase

The Firebase config from the production project (`auction-9bf14`) is already wired inside `src/firebase.ts`. Firestore stores:

- `auctions` collection (name, visibility, password, categories, status, timers, etc.).
- `participants` sub-collection per auction (role, roster, budget, ranking, submission states).

If you ever clone this repo elsewhere and need to rotate credentials, update the `firebaseConfig` export in `src/firebase.ts`.

## Building & deploying to GitHub Pages

1. Build static assets:

   ```bash
   npm run build
   ```

   This runs TypeScript type-checking plus `vite build` and outputs to `dist/`.

2. Preview locally (optional):

   ```bash
   npm run preview
   ```

3. Deploy to GitHub Pages (branch `gh-pages`) using the built-in script:

   ```bash
   npm run deploy
   ```

   The Vite config sets `base: "/saifur-auction/"`, so GitHub Pages serves the app at <https://saifurm.github.io/saifur-auction/>.

All commands are cross-platform (tested on Windows PowerShell). Hot reload, linting, and formatted CSS make it easy to tweak UI while watching Firebase data update in real time.
