# MyMusic

A music streaming service with a Spotify-style interface: a **web app**, **iOS and Android
apps** (React Native / Expo) and an **admin dashboard**, all backed by one **Node.js + Express**
web server with **MongoDB** and **Stripe**.

One server process serves everything from one address:

| URL | What |
|---|---|
| `/` | The MyMusic web app (listen in any browser) |
| `/admin` | The admin dashboard |
| `/api/v1/…` | The API used by the web app, the mobile apps and the dashboard |

MyMusic plays two kinds of content, and treats each according to its rights:

| | Licensed catalog | YouTube |
|---|---|---|
| What it is | Audio the app owner owns or has licensed, uploaded by admins with licence metadata | Public, embeddable music videos found through the YouTube Data API |
| Playback | Browser audio / native audio player: background play, media keys, lock screen | The official YouTube embedded player only, visible on screen |
| Offline | Mobile apps only, for Premium users, when the licence allows it; encrypted on device | Never |
| Stored by us | Audio file, metadata, rights | Only the video id; metadata is re-fetched from YouTube |

## Try it

**Web demo:** https://ayenew-tadesse.github.io/mymusic/ is the web app running on sample songs
entirely in your browser (nothing is saved, no real accounts). It's the root `index.html`
of this repository, a single self-contained file built by `npm run build:pages` in `web/`
(re-run it and commit `index.html` after changing the web app). GitHub Pages only hosts static files, so the full app
with accounts, uploads and payments needs the Node server: see *Run it locally* below, or
put it online for free with MongoDB Atlas and Render in about 10 minutes
([Quick launch](docs/DEPLOYMENT.md#quick-launch-free-mongodb-atlas--render)).

## Features

- **Accounts**: email + password, Sign in with Apple, Google sign-in; email verification, password reset, sign out everywhere, in-app account deletion, data export.
- **Playlists**: import a YouTube / YouTube Music playlist by link, create, rename, reorder, remove, make public / unlisted / private, share links with previews, collaboration invite links, follow, copy.
- **Library**: Liked Songs (favorites), listening history, downloads.
- **Player**: queue (play next, add, reorder, remove), shuffle, repeat off / all / one, sleep timer (minutes or end of track), background playback, lock-screen controls.
- **Catalog**: album artwork, artist pages, album pages, track durations, explicit tags, licence attribution.
- **Offline**: per-device licences (max 30 days without re-check), AES-256-GCM encrypted files, keys in the OS keystore, automatic revocation.
- **Subscriptions**: Stripe Checkout and Customer Portal, webhook-driven plan state, store-policy aware purchase gating.
- **Admin dashboard**: analytics (DAU/MAU, plays, top tracks, subscribers), track upload with rights management, publish / takedown, artists and albums, playlist curation and moderation, user management, audit log.
- **UI**: dark and light themes (follow system or choose), mini player, accessible labels, memoised virtualised lists.

## Repository layout

```
mymusic/
├── server/   Express web server: API + serves web/ and admin/ builds (Node 22, MongoDB, Stripe, S3, YouTube)
├── web/      Web app (React + Vite): the listening experience in the browser
├── admin/    Admin dashboard (React + Vite), served at /admin
├── mobile/   Expo SDK 54 app (expo-router, react-native-track-player, react-query, zustand)
├── docs/     Architecture, database schema, API reference, deployment, compliance
├── Dockerfile           One image: API + web app + admin
├── docker-compose.yml   Local MongoDB + MinIO + the web server
└── render.yaml          One-click deploy on Render
```

## Run it locally (web)

Prerequisites: [Node.js 22+](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/Ayenew-Tadesse/mymusic
cd mymusic/server
cp .env.example .env
# Generate secrets and paste the three printed lines into server/.env:
node -e "const c=require('crypto');console.log('JWT_ACCESS_SECRET='+c.randomBytes(48).toString('base64url'));console.log('JWT_REFRESH_SECRET='+c.randomBytes(48).toString('base64url'));console.log('OFFLINE_KEY_SECRET='+c.randomBytes(32).toString('hex'))"
cd ..
docker compose up --build -d
docker compose exec -e ADMIN_PASSWORD='choose-a-long-password' api npm run seed:admin -- you@example.com "Your Name"
```

Then open:

- **http://localhost:4000**: the web app (sign up or log in)
- **http://localhost:4000/admin**: the admin dashboard (log in with the admin account), where you add artists, albums and tracks

YouTube search, Google / Apple sign-in and subscriptions switch on once you add their keys to
`server/.env` (see [DEPLOYMENT.md](docs/DEPLOYMENT.md)).

### Without Docker

Run MongoDB yourself and set `MONGODB_URI` in `server/.env`, then from the repo root:

```bash
npm run install:all
npm run build        # builds web/ and admin/
npm start            # http://localhost:4000
```

For development with hot reload run `npm run dev:server`, `npm run dev:web` (http://localhost:5174)
and `npm run dev:admin` (http://localhost:5173/admin/) in three terminals; the dev servers proxy
`/api` to the API.

### Mobile apps

```bash
cd mobile && cp .env.example .env && npm install
npx expo run:ios        # or: npx expo run:android
```

Point `EXPO_PUBLIC_API_URL` at your computer's LAN IP (e.g. `http://192.168.1.20:4000`) when using a real phone.

## Tests and checks

```bash
cd server && npm test            # API integration tests (in-memory MongoDB, or set MONGODB_TEST_URI)
cd server && npm run test:unit   # tests that need no database
cd web && npm run lint && npm run build
cd admin && npm run lint && npm run build
cd mobile && npx tsc --noEmit && npx expo lint
```

CI runs all of these on every push (`.github/workflows/ci.yml`).

## Documentation

- [Architecture, database schema and auth flow](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Copyright, YouTube and store policy compliance](docs/COMPLIANCE.md)

## Known limitations

- **Family plan** is a separate Stripe price and plan tier; inviting family members onto one
  subscription is not built yet.
- **Purchases inside the apps** use Stripe Checkout where store rules allow it (see
  [COMPLIANCE.md](docs/COMPLIANCE.md)); StoreKit / Play Billing are not integrated.
- **Offline downloads** are a mobile app feature; the web app streams only, since browsers can't
  keep licensed files encrypted with keys the user can't extract.
- **Offline protection** is AES-256-GCM encryption at rest with keys in the OS keystore, not
  Widevine / FairPlay DRM. If a licensor requires studio DRM, add a DRM packaging step.
- **Rate limits** are in-memory per instance; use a shared store when scaling out.
