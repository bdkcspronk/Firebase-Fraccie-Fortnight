# Fraccie - Location Based Team Game

Next.js 14 + Firebase Realtime Database + Mapbox mobile-first game app.

## Setup

1. Copy `.env.example` to `.env.local` and fill values.
2. Install deps:
   ```bash
   npm install
   ```
3. Run dev server:
   ```bash
   npm run dev
   ```

## Data Model

- `teams/{team_id}` profile/location/wins/losses
- `game` status + circle + code + winner
- `battles/{battle_id}` battle lifecycle
- `bars/{bar_id}` bar circles
- `admins/{uid}` admin whitelist

## Routes

- `/` player gameplay screen
- `/admin` admin control panel

## Manual test flow

1. Open app in two browsers/devices and allow geolocation.
2. In Firebase Realtime Database, seed one or more `bars/{bar_id}` records with lat/lng/radius.
3. Use `/admin` to start game.
4. Move/simulate two teams inside the same bar and within ~40m.
5. Start battle, select type, submit winner, confirm on the other team.
6. Verify winner/loser win/loss stats update and battle is confirmed.
7. Test secret code: enter `game.secret_code` to finish game.

## Deploy

### Option A (recommended): Firebase App Hosting for Next.js

1. Push repo to GitHub.
2. In Firebase Console, open **App Hosting** and connect this repo.
3. Add all `NEXT_PUBLIC_*` environment variables from `.env.example`.
4. Deploy.

### Custom domain (example: `bradley.ink`)

1. In Firebase Hosting/App Hosting, choose **Add custom domain**.
2. Enter `bradley.ink`.
3. Firebase provides DNS verification + routing records.
4. Add those records at your DNS provider (where `bradley.ink` is managed).
5. Wait for verification and SSL issuance, then use `https://bradley.ink`.

> HTTPS is required for browser geolocation.
