# Deployment

Production setup: **MongoDB Atlas**, **S3-compatible storage** (AWS S3 or Cloudflare R2),
**one Docker container** that serves the API, the web app (`/`) and the admin dashboard
(`/admin`) (Render, Fly.io, Railway, AWS ECS / App Runner and Google Cloud Run all work), and
the **mobile apps built and submitted with EAS**.

## Quick launch (free): MongoDB Atlas + Render

This gets the real app online with accounts, playlists, likes, history and the admin
dashboard. YouTube search, uploads, subscriptions and emails switch on later when you
add their keys (sections 3–7).

**1. Database (MongoDB Atlas, free)**
1. Sign up at https://www.mongodb.com/cloud/atlas/register and create a free **M0** cluster.
2. *Database Access*: add a user with a password (letters and numbers only keeps the link simple).
3. *Network Access*: add `0.0.0.0/0` (Render's free plan has no fixed IP address).
4. *Connect → Drivers*: copy the connection string, put your password in it and add the
   database name before the `?`, e.g.
   `mongodb+srv://mymusic:PASSWORD@cluster0.abcde.mongodb.net/mymusic?retryWrites=true&w=majority`

**2. Server (Render, free)**
1. Sign up at https://render.com with your GitHub account.
2. *New → Blueprint*, pick the `mymusic` repository, branch `main`.
3. Fill in the three values Render asks for: `MONGODB_URI` (from step 1), `ADMIN_EMAIL` and
   `ADMIN_PASSWORD` (12+ characters). Everything else is generated.
4. Click *Apply*. The first build takes about 5 minutes.
5. Open the URL Render shows (like `https://mymusic-xxxx.onrender.com`): sign up to listen,
   and sign in at `/admin` with the admin email and password.

The free plan sleeps after 15 minutes without visitors; the next visit takes about a minute
to wake it. A paid instance stays awake.

## 1. Generate secrets

```bash
node -e "const c=require('crypto');for(const n of ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET'])console.log(n+'='+c.randomBytes(48).toString('base64url'));for(const n of ['OFFLINE_KEY_SECRET','DATA_ENCRYPTION_KEY'])console.log(n+'='+c.randomBytes(32).toString('hex'))"
```

Keep them in your host's secret manager, never in git. Changing `OFFLINE_KEY_SECRET` makes
existing downloads undecryptable (users re-download). Changing the JWT secrets signs everyone out.

## 2. MongoDB Atlas

1. Create a cluster (M10 or larger for production, so you get backups and private networking).
2. Create a database user with `readWrite` on the `mymusic` database only.
3. Restrict network access to your API's egress IPs or use a private endpoint / VPC peering.
4. Set `MONGODB_URI=mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net/mymusic?retryWrites=true&w=majority`.
5. Turn on continuous backups.

Indexes are not auto-built in production. `npm run db:indexes` builds them; run it as the
release / pre-deploy command.

## 3. Object storage

**AWS S3**

1. Create a bucket (e.g. `mymusic-media`) with *Block all public access* on and SSE enabled.
2. Serve artwork publicly through CloudFront with an origin access control limited to the
   `artwork/*` prefix; set `ASSET_PUBLIC_BASE_URL=https://<distribution>.cloudfront.net`.
   Audio under `audio/*` is never public; the API hands out signed URLs.
3. Bucket CORS, so the admin dashboard can upload directly:

```json
[{ "AllowedOrigins": ["https://admin.mymusic.app"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3000 }]
```

4. IAM policy for the API's credentials (least privilege):

```json
{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::mymusic-media/*" }] }
```

**Cloudflare R2**: same idea; set `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`,
`S3_REGION=auto`, and expose artwork with a custom domain on a public bucket or Worker.

## 4. Google Cloud (YouTube Data API and Google sign-in)

1. Create a project, enable **YouTube Data API v3**.
2. Create an **API key** restricted to the YouTube Data API v3 and (if your host has static
   egress IPs) to those IPs. Set `YOUTUBE_API_KEY`.
3. The default quota is 10,000 units/day; a search costs 100. Results are cached
   (`YOUTUBE_CACHE_TTL_SECONDS`) and searches are rate limited per user. For more quota,
   apply through the YouTube API Services audit, which reviews the compliance points in
   [COMPLIANCE.md](COMPLIANCE.md).
4. Configure the **OAuth consent screen**, then create OAuth client ids:
   - iOS (bundle id) → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
   - Android (package name + SHA-1 of the EAS signing key: `eas credentials`) → `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
   - Web → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   Put all three in the API's `GOOGLE_CLIENT_IDS` (comma separated).

## 5. Apple

1. In the Apple Developer portal, enable **Sign in with Apple** for the app id
   (`IOS_BUNDLE_ID`, default `app.mymusic.ios`). Set `APPLE_BUNDLE_IDS` to it.
2. For token revocation on account deletion (App Store guideline 5.1.1(v)) create a
   *Sign in with Apple* key and set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`
   (bundle id) and `APPLE_PRIVATE_KEY` (the `.p8` contents, newlines as `\n`).
   `DATA_ENCRYPTION_KEY` must be set so the Apple refresh tokens are stored encrypted.

## 6. Stripe

1. Create products **Premium** (monthly and yearly prices) and **Family** (monthly).
   Put the price ids in `STRIPE_PRICE_PREMIUM_MONTHLY`, `STRIPE_PRICE_PREMIUM_YEARLY`, `STRIPE_PRICE_FAMILY_MONTHLY`.
2. Configure the **Customer Portal** (cancel, switch plan, update card).
3. Add a webhook endpoint `https://api.mymusic.app/api/v1/billing/webhook` for:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`,
   `invoice.payment_failed`. Set `STRIPE_WEBHOOK_SECRET` to its signing secret.
4. Use test mode keys for staging; test locally with `stripe listen --forward-to localhost:4000/api/v1/billing/webhook`.
5. Decide `ALLOW_IOS_EXTERNAL_PURCHASE` / `ALLOW_ANDROID_EXTERNAL_PURCHASE` with your legal
   team; see [COMPLIANCE.md](COMPLIANCE.md#app-store-and-google-play-payments).

## 7. Email

Any SMTP provider (Amazon SES, Postmark, SendGrid, Mailgun). Set
`SMTP_URL=smtps://USER:PASS@smtp.example.com:465` and `MAIL_FROM`. Configure SPF, DKIM and DMARC
for the sending domain.

## 8. Web server (API + web app + admin)

Build and run the single image from the repository root:

```bash
docker build -t mymusic .
docker run --env-file server/.env.production -p 4000:4000 mymusic
```

The image builds `web/` and `admin/` and the server serves them at `/` and `/admin`
(`WEB_DIST_DIR` / `ADMIN_DIST_DIR`). Without Docker: `npm run install:all && npm run build && npm start`.

Required production variables: everything in `server/.env.example`; the server refuses to boot
in production without the YouTube key, Stripe keys, bucket, SMTP and encryption key.

Platform notes:

- **Render**: use the `render.yaml` Blueprint (Docker, health check `/readyz`, pre-deploy
  `npm run db:indexes`).
- **Fly.io**: `fly launch` in `server/`, `[deploy] release_command = "npm run db:indexes"`,
  HTTP check on `/readyz`.
- **AWS**: ECR + ECS Fargate (or App Runner) behind an ALB with TLS; secrets from Secrets Manager.

Always:

- Terminate TLS in front of the API and set `TRUST_PROXY` to the number of proxies in front of
  it (usually 1), so rate limiting and logging see real client IPs.
- Put the API behind Cloudflare (or set `x-country-code` at your load balancer) so
  `CF-IPCountry` is available for territory licensing.
- With more than one instance, back the rate limiters with Redis (`rate-limit-redis`).
- Set `PUBLIC_API_URL` to the public address of the server (e.g. `https://mymusic.app`); share
  links, email links and Stripe return pages use it. `CORS_ORIGINS` is only needed if you host
  a front end on a different origin.
- For **Google sign-in on the web** create a *Web application* OAuth client with your domain as
  an authorised JavaScript origin and set `GOOGLE_WEB_CLIENT_ID`. For **Sign in with Apple on
  the web** create a Services ID with your domain and return URL and set `APPLE_WEB_SERVICES_ID`.
- Logs are JSON on stdout (pino) with auth headers, cookies and tokens redacted; ship them to
  your log platform and alert on 5xx rates.

Create the first admin once the API is up:

```bash
ADMIN_PASSWORD='a long unique password' npm run seed:admin -- admin@mymusic.app "Admin"
```

## 9. Web app and admin dashboard

Both are served by the web server above; nothing extra to deploy. The server's
Content-Security-Policy allows only this origin plus the YouTube player, Google / Apple
sign-in and your storage hosts. Consider restricting `/admin` to your company network or
putting it behind an SSO proxy (Cloudflare Access, Google IAP).

To host them separately on a static host instead, build with `VITE_API_URL=https://api.example.com`
(admin) and proxy `/api` to the API (web), then set `CORS_ORIGINS`. Keep them on a sibling
subdomain of the API so the `SameSite=Strict` refresh cookie works. `admin/public/_headers` has
security headers for Netlify / Cloudflare Pages.

## 10. Mobile apps (EAS)

```bash
npm i -g eas-cli
cd mobile
eas login
eas init                      # sets EAS_PROJECT_ID
eas env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value ... --environment production
# repeat for EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
# EXPO_PUBLIC_PRIVACY_URL, EXPO_PUBLIC_TERMS_URL, IOS_BUNDLE_ID, ANDROID_PACKAGE
eas build --profile production --platform all
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

- `eas.json` sets `EXPO_PUBLIC_API_URL` per profile (development, preview, production).
- The app needs a development build (`eas build --profile development`) rather than Expo Go,
  because of `react-native-track-player` and other native modules.
- iOS: background audio (`UIBackgroundModes: audio`) and Sign in with Apple are configured in
  `app.config.ts`. A privacy manifest is included; complete the App Privacy questionnaire
  (email, user id, purchase history, usage data).
- Android: the app declares the media playback foreground service permissions; complete the
  Play Console *Data safety* form and the foreground service declaration (media playback).
- Universal / App Links for `https://<domain>/p/<id>`: set `UNIVERSAL_LINK_DOMAIN`, then host
  `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` on that domain.
- Ship over-the-air JS fixes with `eas update` (add `expo-updates` first).

## 11. Go-live checklist

- [ ] All secrets set in the secret manager; `.env` files not committed
- [ ] `npm run db:indexes` ran against production
- [ ] Atlas backups on; restore tested
- [ ] Stripe live keys, webhook receiving events (check the Stripe dashboard deliveries)
- [ ] Admin account created; tracks uploaded with complete licence data
- [ ] Privacy policy and terms published at `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL`
- [ ] YouTube API compliance points reviewed ([COMPLIANCE.md](COMPLIANCE.md))
- [ ] Monitoring: uptime check on `/readyz`, 5xx alerting, Atlas alerts
