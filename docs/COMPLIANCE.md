# Copyright, YouTube and platform compliance

This document maps the legal and policy requirements to what the code does, and lists what
the app owner still has to do. It is engineering guidance, not legal advice; have counsel
review your licences, terms and privacy policy before launch.

## Licensed catalog (copyright)

| Requirement | Implementation |
|---|---|
| Only distribute music you have rights to | Admins must record licence type, licensor, reference, territories, validity window and whether streaming / offline use is allowed before a track can be published (`server/src/routes/admin.js`, `TrackEditor.tsx`). |
| Respect territory and term limits | `Track.isAvailable()` and the catalog query filter enforce territory (`rights.territories` vs the listener's country) and `validFrom` / `validUntil` for every listing, stream URL and download licence. |
| Respect offline restrictions | Downloads need `rights.offlineAllowed` and a paid plan; licences expire after ≤30 days without re-check, at the end of the paid period and at the end of the content licence. |
| Takedowns (DMCA / notice and takedown) | *Take down* in the dashboard hides the track everywhere, revokes all offline licences (devices delete files on next sync) and writes the reason (e.g. the notice id) to the audit log. |
| Attribution (e.g. Creative Commons BY) | `rights.attribution` is shown on the Now Playing screen. |
| Protect files | Audio is in a private bucket; clients get 10 minute signed URLs; downloads are encrypted at rest with per-licence keys. |

**Owner's responsibilities:** sign licences that cover interactive streaming and (if offered)
offline caching in each territory; arrange public performance / mechanical licences through the
relevant collecting societies; register a DMCA agent with the US Copyright Office and publish a
takedown contact; keep licence documents referenced by `licenseReference`.

## YouTube API Services

The app uses the YouTube Data API only to **search for and display metadata of public videos**,
and plays them only through the **official embedded player**.

| Policy point | Implementation |
|---|---|
| No downloading, caching or extracting audio / video | YouTube items are never downloadable; there is no code path that fetches YouTube media. Offline features are catalog only. |
| Play only through the embedded player, unmodified, with YouTube branding and controls | Mobile: `mobile/src/player/YouTubeView.tsx`; web: `web/src/player/YouTubeDock.tsx`. Both render the official IFrame player with its controls; nothing overlays it. |
| No background or audio-only playback | Mobile: YouTube plays only while the Now Playing screen is visible and pauses when the app is backgrounded. Web: the player is docked on screen whenever a video is current, never hidden or reduced to audio. On both, the queue never auto-starts a YouTube video while the app / tab is in the background. |
| Player size | The embed is 16:9, at least 200 px high (mobile: full content width; web: 400 px wide dock, full width on phones). |
| Only playable content | Search requests `videoEmbeddable=true`, `videoSyndicated=true`; results are re-checked for `status.embeddable` and public privacy status. |
| Stored API data limits | Only video ids are stored in playlists, favorites and history. Metadata is cached for one hour by default (TTL index) and re-fetched on read. Deleting an account deletes the ids. |
| API key security | The key lives only on the server; clients call the MyMusic API. |
| Quota | Results cached; searches rate limited per user and run only on submit. |
| Terms and privacy links | Sign-up screen and Settings link to the YouTube Terms of Service and the Google Privacy Policy, as the YouTube API Services Terms require. |
| Clear attribution | YouTube items carry a "YouTube" label in lists, "Playing from YouTube" and a *Watch on YouTube* link in the player. |
| Don't sell YouTube content | Premium covers the licensed catalog only; YouTube content is free for everyone and the paywall copy says so. |

**Owner's responsibilities:** your privacy policy must say that the app uses YouTube API
Services and link to the Google Privacy Policy; make sure your Terms of Use reference the YouTube
Terms of Service; complete the YouTube API Services compliance audit before requesting more
quota; don't add features that monetise YouTube content (e.g. ads around the embedded player)
without checking the policies.

## App Store and Google Play

### Payments

Digital subscriptions sold inside iOS / Android apps normally have to use Apple In-App Purchase
or Google Play Billing. Exceptions depend on the storefront and the programs you've joined
(e.g. the US storefront after the Epic v. Apple injunction, Apple's External Link Account
Entitlement for reader / music apps in some regions, Google Play's alternative / user choice
billing programs and the US changes after Epic v. Google).

The server decides per platform:

- `ALLOW_IOS_EXTERNAL_PURCHASE` / `ALLOW_ANDROID_EXTERNAL_PURCHASE` = `false` (default): the app
  shows no prices, plans or purchase buttons and `/billing/checkout` refuses requests from that
  platform. Users subscribe on the web (Stripe Checkout) and the app unlocks Premium from the
  account state.
- `true`: the app opens Stripe Checkout in the system browser. Enable this only for builds and
  storefronts where it's permitted, and add any disclosure sheets the store requires.

If you need in-app purchases in every storefront, add StoreKit / Play Billing (e.g. RevenueCat)
alongside Stripe and map both into `user.subscription`.

### Other store requirements covered

- **Sign in with Apple** is offered on iOS whenever Google sign-in is (guideline 4.8).
- **Account deletion** in-app (Settings → Delete account) deletes data, cancels the Stripe
  subscription and revokes Sign in with Apple tokens (guideline 5.1.1(v); Google Play account
  deletion policy). Also provide a web deletion URL for the Play listing.
- **Background audio** is used only for actual audio playback of catalog tracks.
- **Privacy**: iOS privacy manifest in `app.config.ts`; fill in App Privacy and Data safety forms.
  No ads, tracking SDKs or IDFA access are included.
- **Encryption export**: the app uses standard encryption only (HTTPS, AES via a standard
  library), declared with `ITSAppUsesNonExemptEncryption: false`. Confirm with counsel for your
  jurisdictions.

## Privacy and security

- Passwords hashed with bcrypt (cost 12); refresh tokens stored as SHA-256 hashes; Apple
  refresh tokens AES-256-GCM encrypted.
- Short lived access tokens, rotating refresh tokens with reuse detection, immediate revocation
  through `tokenVersion`.
- All input validated with zod; Helmet security headers and strict CSP; CORS allow list; rate
  limits on auth, search and globally; body size limits.
- Admin actions are written to an audit log; admins can't change their own role.
- Data export (`GET /me/export`) and deletion (`DELETE /me`) support GDPR / CCPA requests.
  Listening history expires after 365 days.
- Logs redact authorization headers, cookies, passwords and tokens.
