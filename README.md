# MyMusic

A music streaming app for iOS and Android with a Spotify-style interface, built on
**React Native (Expo)**, **Node.js + Express**, **MongoDB** and **Stripe**, plus a web
**admin dashboard**.

MyMusic plays two kinds of content, and treats each according to its rights:

| | Licensed catalog | YouTube |
|---|---|---|
| What it is | Audio the app owner owns or has licensed, uploaded by admins with licence metadata | Public, embeddable music videos found through the YouTube Data API |
| Playback | Native audio player: background play, lock screen, headset controls | The official YouTube embedded player only, visible on screen |
| Offline | Yes, for Premium users, when the licence allows it; encrypted on device | Never |
| Stored by us | Audio file, metadata, rights | Only the video id; metadata is re-fetched from YouTube |

## Features

- **Accounts**: email + password, Sign in with Apple, Google sign-in; email verification, password reset, sign out everywhere, in-app account deletion, data export.
- **Playlists**: create, rename, reorder, remove, make public / unlisted / private, share links with previews, collaboration invite links, follow, copy.
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
├── server/   Express API (Node 22, MongoDB/Mongoose, Stripe, S3, YouTube Data API)
├── mobile/   Expo SDK 54 app (expo-router, react-native-track-player, react-query, zustand)
├── admin/    React + Vite admin dashboard
├── docs/     Architecture, database schema, API reference, deployment, compliance
└── docker-compose.yml   Local MongoDB + MinIO + API
```

## Quick start (local)

Prerequisites: Node 22+, Docker (or a local MongoDB), Xcode and/or Android Studio for device builds.

```bash
# 1. API
cd server
cp .env.example .env
# fill JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (48 random bytes each) and OFFLINE_KEY_SECRET (32 random bytes, hex)
node -e "const c=require('crypto');console.log(c.randomBytes(48).toString('base64url'));console.log(c.randomBytes(48).toString('base64url'));console.log(c.randomBytes(32).toString('hex'))"
cd .. && docker compose up --build -d      # MongoDB, MinIO and the API on :4000
docker compose exec -e ADMIN_PASSWORD='choose-a-long-password' api npm run seed:admin -- you@example.com "Your Name"

# 2. Admin dashboard
cd admin && cp .env.example .env && npm install && npm run dev   # http://localhost:5173

# 3. Mobile app (needs a development build because of native modules)
cd mobile && cp .env.example .env && npm install
npx expo run:ios        # or: npx expo run:android
```

Without Docker: run MongoDB yourself, set `MONGODB_URI`, then `cd server && npm install && npm run dev`.

Point `EXPO_PUBLIC_API_URL` at your machine's LAN IP when running on a physical device.

## Tests and checks

```bash
cd server && npm test            # API integration tests (in-memory MongoDB, or set MONGODB_TEST_URI)
cd server && npm run test:unit   # tests that need no database
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
- **Offline protection** is AES-256-GCM encryption at rest with keys in the OS keystore, not
  Widevine / FairPlay DRM. If a licensor requires studio DRM, add a DRM packaging step.
- **Rate limits** are in-memory per instance; use a shared store when scaling out.
