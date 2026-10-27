# API reference

Base URL: `https://<api-host>/api/v1`. JSON in, JSON out. Authenticated routes need
`Authorization: Bearer <accessToken>`.

Errors always look like:

```json
{ "error": { "code": "premium_required", "message": "This track needs a Premium plan", "details": [] } }
```

Common codes: `bad_request` (400, with `details` per field), `unauthorized` (401),
`premium_required` (402), `forbidden` / `account_suspended` (403), `not_found` (404),
`conflict` / `email_taken` / `edit_conflict` / `device_limit` (409), `rate_limited` (429),
`not_licensed` / `offline_not_licensed` (451), `youtube_quota` / `*_unconfigured` (503).

## Auth: `/auth`

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/register` | `email, password (10–72), displayName, deviceName?` | 201 `{user, accessToken, refreshToken}`; sends verification email |
| POST | `/login` | `email, password, deviceName?` | |
| POST | `/google` | `idToken, deviceName?` | Google ID token, audience must be in `GOOGLE_CLIENT_IDS` |
| POST | `/apple` | `identityToken, nonce, authorizationCode?, fullName?, deviceName?` | `nonce` is the raw nonce; the token carries its SHA-256 |
| POST | `/refresh` | `refreshToken` (or cookie with `X-Client: web`) | Rotates; reuse of an old token revokes the family |
| POST | `/logout` | `refreshToken` | 204 |
| POST | `/logout-all` | (auth) | Ends every session |
| POST | `/email/resend` | (auth) | |
| POST | `/email/verify` | `token` | From the emailed link |
| POST | `/password/forgot` | `email` | Always 202 |
| POST | `/password/reset` | `token, password` | Ends all sessions |

Auth endpoints are rate limited to 20 requests / 15 min / IP.

## Me: `/me` (auth)

| Method | Path | Body / notes |
|---|---|---|
| GET | `/` | `{user}` |
| PATCH | `/` | `displayName?, avatarUrl?, country?, preferences{theme, allowExplicit}?` |
| PUT | `/password` | `currentPassword?, newPassword`; returns a fresh session |
| GET | `/export` | Full JSON export of the user's data |
| DELETE | `/` | `{confirm: "DELETE"}`; cancels Stripe subscription, revokes Apple tokens, deletes data |

## Catalog: `/catalog` (auth)

Only tracks that are published and licensed for the listener's territory (profile `country`,
else the CDN `CF-IPCountry` header) are returned.

| Method | Path | Notes |
|---|---|---|
| GET | `/home` | `{editorial, newReleases, popular, recentlyPlayed}` |
| GET | `/search?q=` | `{tracks, artists, albums, playlists}` |
| GET | `/tracks?page&limit&genre` | Paged |
| GET | `/tracks/:id` | `{track}` |
| GET | `/tracks/:id/stream` | `{url, mimeType, expiresAt}`: signed URL (10 min). 402 if premium-only, 451 if not licensed here |
| GET | `/artists/:id` | `{artist, topTracks, albums}` |
| GET | `/albums/:id` | `{album, tracks, totalDurationSec}` |

Track object:

```json
{ "kind": "catalog", "id": "…", "title": "…", "artist": {"id": "…", "name": "…"}, "album": {"id": "…", "title": "…"},
  "artworkUrl": "https://…", "durationSec": 215, "explicit": false, "attribution": null,
  "freeTier": true, "playable": true, "downloadable": false }
```

## YouTube: `/youtube` (auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/search?q=&pageToken=` | Embeddable, public music videos. 30 / min / user |
| GET | `/videos?ids=a,b,c` | Up to 50 ids |

Video object: `{kind: "youtube", videoId, title, channelTitle, channelId, thumbnailUrl, durationSec, watchUrl}`.

## Playlists: `/playlists`

| Method | Path | Body / notes |
|---|---|---|
| GET | `/shared/:shareId` | Public (no auth) for unlisted / public playlists |
| GET | `/` | Owned, collaborating and followed playlists |
| POST | `/` | `name, description?, visibility?` |
| GET | `/:id` | Hydrated items, `totalDurationSec`, `shareUrl` |
| PATCH | `/:id` | `name?, description?, coverUrl?, visibility?` (visibility: owner only) |
| DELETE | `/:id` | Owner only |
| POST | `/:id/copy` | Duplicate into a new private playlist |
| POST | `/:id/items` | `items: [{kind:"catalog",trackId} \| {kind:"youtube",videoId}], position?` |
| DELETE | `/:id/items/:itemId` | |
| PUT | `/:id/items/order` | `itemId, toIndex` |
| POST | `/:id/share` | `visibility ("unlisted" \| "public"), rotate?` returns `shareUrl` |
| POST | `/:id/invite` | Owner; returns a 7-day collaborator invite link |
| POST | `/join` | `token` |
| DELETE | `/:id/collaborators/:userId` | Owner, or the collaborator leaving |
| POST / DELETE | `/:id/follow` | Public or editorial playlists |

Concurrent edits return 409 `edit_conflict`; reload and retry.

## Library: `/library` (auth)

| Method | Path | Body / notes |
|---|---|---|
| GET | `/favorites?page&limit` | Hydrated items |
| GET | `/favorites/ids` | `{trackIds, videoIds}` |
| POST / DELETE | `/favorites` | `{kind, trackId}` or `{kind, videoId}` |
| POST | `/history` | `plays: [{kind, trackId \| videoId, msPlayed, completed, offline, playedAt?, context?, platform}]` (≤100) |
| GET | `/history?page&limit` | Newest first |
| DELETE | `/history` | Clear |

## Downloads: `/downloads` (auth; Premium for creating)

| Method | Path | Body / notes |
|---|---|---|
| GET | `/devices` | `{devices, max}` |
| POST | `/devices` | `deviceId, name?`; 409 `device_limit` |
| DELETE | `/devices/:deviceId` | Revokes that device's licences |
| POST | `/licenses` | `trackId, deviceId` → `{license{id,expiresAt}, contentKey, download{url,mimeType,sizeBytes}, track}` |
| POST | `/licenses/sync` | `deviceId, licenseIds[]` → `{renewed[{id,expiresAt}], revoked[]}` |
| DELETE | `/licenses/:id` | |

## Billing: `/billing`

| Method | Path | Notes |
|---|---|---|
| GET | `/plans?platform=ios\|android\|web` | `{canPurchase, plans[{id, plan, interval, amount, currency}], current}` |
| POST | `/checkout` | `planId, platform` → `{url}` (Stripe Checkout). 403 where store rules forbid |
| POST | `/portal` | `{url}` (Stripe Customer Portal) |
| POST | `/webhook` | Stripe only; raw body, signature verified |

## Admin: `/admin` (role `admin`)

| Method | Path | Notes |
|---|---|---|
| GET | `/stats?days=` | Totals, plays per day, top tracks, source split, subscribers |
| POST | `/uploads` | `kind (audio\|image), contentType` → presigned PUT `{key, url, headers, publicUrl}` |
| GET / POST | `/artists` | List (`q`, paging) / create |
| PATCH | `/artists/:id` | |
| GET / POST | `/albums` | |
| PATCH | `/albums/:id` | |
| GET / POST | `/tracks` | Create requires `audioKey` and full `rights`; starts as draft |
| GET / PATCH | `/tracks/:id` | |
| POST | `/tracks/:id/status` | `status (draft\|published\|takedown), reason?`; takedown revokes offline licences |
| GET / POST | `/playlists` | List with filters / create editorial playlist |
| PATCH / DELETE | `/playlists/:id` | Feature, hide, rename, delete |
| GET | `/users?q&role&status&plan` | |
| GET / PATCH | `/users/:id` | `role?, status?` (ends their sessions) |
| POST | `/users/:id/revoke-sessions` | |
| GET | `/audit` | Audit log |

## Config: `/config`

`GET /config` → `{googleClientId, appleServicesId, youtubeEnabled, billingEnabled}` (public, no secrets). Used by the web app.

## Public pages (no `/api/v1` prefix)

| Path | Purpose |
|---|---|
| `GET /p/:shareId` | Shared playlist preview with Open Graph tags and "Open in MyMusic" deep link |
| `GET /invite/:token` | Collaborator invite landing page |
| `GET /verify-email`, `GET/POST /reset-password` | Email verification and password reset pages |
| `GET /billing/success`, `/billing/cancel`, `/billing/return` | Stripe return pages for the mobile apps |
| `GET /healthz`, `GET /readyz` | Liveness and readiness (DB connected) probes |
| `GET /`, `GET /admin/` | The web app and admin dashboard (any other non-API path falls back to the web app) |
