# Architecture

```mermaid
flowchart LR
  subgraph Device["Mobile app (Expo)"]
    UI[Screens / expo-router]
    Q[Queue store<br/>zustand]
    TP[react-native-track-player<br/>background audio]
    YT[YouTube IFrame player<br/>visible only]
    OFF[Offline manager<br/>AES-GCM files + keystore]
  end
  Web[Web app<br/>React + Vite, served at /]
  Admin[Admin dashboard<br/>React + Vite, served at /admin]
  API[Express API]
  DB[(MongoDB)]
  S3[(Private object storage<br/>S3 / R2 / MinIO)]
  YTAPI[YouTube Data API v3]
  Stripe[Stripe]
  Google[Google / Apple identity]

  UI --> Q --> TP
  Q --> YT
  TP -- signed URL --> S3
  OFF -- signed URL --> S3
  UI -- HTTPS + Bearer --> API
  Web -- same origin, Bearer + httpOnly refresh cookie --> API
  Admin -- same origin, Bearer + httpOnly refresh cookie --> API
  Admin -- presigned PUT --> S3
  API --> DB
  API --> YTAPI
  API --> Stripe
  Stripe -- webhooks --> API
  API -- verify ID tokens --> Google
```

## Server (`server/`)

| Path | Responsibility |
|---|---|
| `src/config/env.js` | Validates every environment variable with zod at boot; refuses to start when misconfigured. |
| `src/app.js` | Helmet (strict CSP), CORS allow list, compression, rate limits, routing, JSON error handler. |
| `src/middleware/` | `requireAuth` / `optionalAuth` / `requireAdmin` / `requirePremium`, zod `validate`, rate limiters, error mapping. |
| `src/services/tokens.js` | Access JWTs, rotating refresh tokens with reuse detection, single-purpose tokens. |
| `src/services/socialAuth.js` | Google and Apple ID token verification; Apple REST token revocation. |
| `src/services/youtube.js` | YouTube search / video lookups with quota-saving cache. |
| `src/services/billing.js` | Stripe Checkout, Portal, webhook processing (idempotent). |
| `src/services/storage.js` | Presigned S3 upload and download URLs. |
| `src/services/offlineKeys.js` | Derives per-licence AES keys (HMAC-SHA256 of the licence id). |
| `src/routes/*` | HTTP endpoints, see [API.md](API.md). |

Every handler reads input only from `req.valid` (zod-parsed), so request bodies can't smuggle
MongoDB operators into queries.

## Database schema (MongoDB)

```mermaid
erDiagram
  USER ||--o{ REFRESH_TOKEN : has
  USER ||--o{ PLAYLIST : owns
  USER }o--o{ PLAYLIST : "collaborates / follows"
  USER ||--o{ FAVORITE : likes
  USER ||--o{ LISTENING_EVENT : plays
  USER ||--o{ OFFLINE_LICENSE : holds
  ARTIST ||--o{ ALBUM : releases
  ARTIST ||--o{ TRACK : performs
  ALBUM ||--o{ TRACK : contains
  TRACK ||--o{ OFFLINE_LICENSE : "licensed as"
  PLAYLIST ||--o{ PLAYLIST_ITEM : embeds
  PLAYLIST_ITEM }o--o| TRACK : "catalog item"
```

| Collection | Key fields | Indexes / lifecycle |
|---|---|---|
| `users` | `email`, `passwordHash` (bcrypt 12, never selected by default), `googleId`, `appleId`, `appleRefreshToken` (AES-GCM encrypted), `role`, `status`, `tokenVersion`, `subscription{plan,status,stripeCustomerId,stripeSubscriptionId,currentPeriodEnd,cancelAtPeriodEnd}`, `offlineDevices[]`, `preferences{theme,allowExplicit}`, `country` | unique partial on `email`, `googleId`, `appleId`; unique sparse `subscription.stripeCustomerId` |
| `refreshtokens` | `user`, `tokenHash` (SHA-256), `family`, `expiresAt`, `revokedAt`, `replacedAt` | unique `tokenHash`; TTL on `expiresAt` |
| `artists` | `name`, `bio`, `imageUrl`, `genres`, `verified` | text on `name` |
| `albums` | `title`, `artist`, `artworkUrl`, `releaseDate`, `label`, `upc` | `artist` |
| `tracks` | `title`, `artist`, `album`, `durationSec`, `explicit`, `isrc`, `artworkUrl`, `audioKey` (hidden), `freeTier`, `status` (draft / published / takedown), `playCount`, `rights{licenseType,licensor,licenseReference,attribution,territories[],streamAllowed,offlineAllowed,validFrom,validUntil}` | `status+createdAt`, `status+playCount`, `genres`, text on `title` |
| `playlists` | `owner`, `name`, `description`, `coverUrl`, `visibility`, `shareId`, `collaborators[]`, `followers[]`, `isEditorial`, `hidden`, `items[{kind, track \| videoId, addedBy, addedAt}]` (max 1000) | unique `shareId`; `owner`, `collaborators`, `isEditorial` |
| `favorites` | `user`, `kind`, `track` \| `videoId` | unique partial `(user, track)` and `(user, videoId)` |
| `listeningevents` | `user`, `kind`, `track` \| `videoId`, `playedAt`, `msPlayed`, `completed`, `offline`, `context`, `platform` | `user+playedAt`; TTL 365 days |
| `offlinelicenses` | `user`, `track`, `deviceId`, `expiresAt`, `revokedAt`, `revokeReason` | unique `(user, deviceId, track)` |
| `youtubecaches` | `key`, `value`, `expiresAt` | TTL (default 1 hour) |
| `webhookevents` | Stripe `eventId` | unique; TTL 60 days |
| `auditlogs` | `actor`, `action`, `targetType`, `targetId`, `meta`, `ip`, `at` | `at`, `target` |

YouTube items store **only the video id**. Titles, thumbnails and durations are fetched from
the API when a playlist / favorites / history page is read.

## Authentication flow

```mermaid
sequenceDiagram
  participant App
  participant Provider as Apple / Google
  participant API
  participant DB
  alt Email + password
    App->>API: POST /auth/login {email, password}
    API->>DB: find user, bcrypt.compare
  else Google
    App->>Provider: OAuth 2.0 + PKCE (system browser)
    Provider-->>App: id_token
    App->>API: POST /auth/google {idToken}
    API->>Provider: verify signature + audience (google-auth-library)
  else Apple
    App->>App: rawNonce = random 32 bytes
    App->>Provider: signInAsync(nonce = sha256(rawNonce))
    Provider-->>App: identityToken, authorizationCode
    App->>API: POST /auth/apple {identityToken, nonce: rawNonce, authorizationCode}
    API->>Provider: verify JWT via Apple JWKS, aud = bundle id, nonce hash matches
    API->>Provider: exchange code for refresh token (kept encrypted for revocation)
  end
  API->>DB: upsert user, store sha256(refresh token)
  API-->>App: user, accessToken (15 min JWT), refreshToken (opaque, 30 days)
  App->>App: refresh token -> Keychain / Keystore, access token -> memory
  Note over App,API: Later
  App->>API: request with expired access token
  API-->>App: 401
  App->>API: POST /auth/refresh {refreshToken} (single flight)
  API->>DB: atomically mark old token replaced, issue new pair (same family)
  Note over API: Replaying a replaced token revokes the whole family
```

- **Account linking**: a Google / Apple identity is linked to an existing email account only
  when the provider says the email is verified. If the existing account never verified its
  email, its password is removed and its sessions are invalidated, so an attacker who
  pre-registered someone else's address can't keep access.
- **Sign out everywhere / suspension / role change** bump `tokenVersion`, invalidating every
  access token immediately, and delete all refresh tokens.
- **Admin dashboard** sends `X-Client: web`; the refresh token then goes in an httpOnly,
  `SameSite=Strict` cookie scoped to `/api/v1/auth` and the access token stays in memory.
- **Password reset tokens** are bound to a fingerprint of the current password hash, so they
  are single use and die once the password changes.

## Web app (`web/`)

Same features as the mobile app except offline downloads. The Express server serves its build
at `/` (and the admin build at `/admin`) with long-lived caching for hashed assets and an
`index.html` fallback for client-side routes.

- Sign-in: email / password, Google Identity Services and Sign in with Apple JS, all ending in
  the same API session. The refresh token is an httpOnly `SameSite=Strict` cookie; the access
  token stays in memory.
- Playback: catalog tracks play in an `<audio>` element from signed URLs (refreshed
  automatically if one expires mid-track), with Media Session support for media keys and OS
  controls. YouTube videos play in the official IFrame player, docked on screen whenever one is
  current. Queue, shuffle, repeat, sleep timer and volume live in a persisted zustand store.

## Playback design (mobile)

- `player/store.ts` (zustand, persisted) owns the queue, shuffle (keeps the original order to
  restore), repeat mode and sleep timer.
- `player/engine.ts` loads the current item:
  - **catalog track**: decrypted offline file if downloaded, otherwise a 10 minute signed URL
    from `GET /catalog/tracks/:id/stream`; played by `react-native-track-player`, which handles
    background audio, audio focus / interruptions and lock-screen controls.
  - **YouTube video**: handed to `YouTubeView` (the official IFrame player via
    `react-native-youtube-iframe`) on the Now Playing screen. Leaving that screen or
    backgrounding the app pauses it. The queue stops at a YouTube item while in the background.
- `player/service.ts` is the headless playback service: remote controls, advancing the queue
  when a catalog track ends, sleep timer checks.
- `player/history.ts` reports plays ≥30 s (or completed), buffering them offline.

## Offline downloads

1. The app registers a device id (random UUID in SecureStore); the server limits devices per
   account (`MAX_OFFLINE_DEVICES`).
2. `POST /downloads/licenses` checks Premium, rights (`offlineAllowed`, territory, validity
   window) and returns a licence, a 15 minute signed download URL and a 256-bit content key.
   Licence expiry is the earliest of 30 days, the content licence end and the paid period end.
3. The app downloads over HTTPS to the cache directory, encrypts it in 512 KB AES-256-GCM
   chunks (licence id, chunk index and last-chunk flag bound as AAD) into app-private storage,
   deletes the plaintext and keeps the key in the Keychain / Keystore (`THIS_DEVICE_ONLY`).
4. To play, the file is decrypted into a single temporary cache file that is deleted on the
   next track and on every launch.
5. `POST /downloads/licenses/sync` (on launch, on reconnect, on foreground) renews licences and
   returns revoked ones (takedown, rights change, subscription ended, device removed); the app
   deletes those files and keys. Expired licences are purged even while offline.

Client-side encryption protects files at rest and ties them to the app and account. If a
licensor contract requires studio-grade DRM, serve the catalog through a DRM packager
(Widevine / FairPlay) instead; the licence and rights model here stays the same.
