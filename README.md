# PetCard API

Node 20+/22, Express 4, MongoDB (Mongoose 8), plain JS (ESM).

## Run locally
```bash
cp .env.example .env        # fill MONGODB_URI and JWT_SECRET (64+ random chars)
npm install
npm run dev
```
Without `SMTP_HOST` the mailer is in dry-run mode: OTP codes are printed in the terminal.

## Optional: avatar / sticker catalogue
`cp data/catalog.sample.json data/catalog.json`, put the real keys, then `npm run seed:catalog`.
Until then the API only checks the key format.

## Deploy on Render
Build command `npm ci`, start command `npm start`, health check path `/api/health`.
Environment: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (new, 64+ chars), `COOKIE_SECURE=true`,
`ADMIN_ORIGIN=<admin https URL>`, `OTP_EXPIRES_MINUTES=2`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM="PetCard <you@example.com>"`,
`CLOUD_NAME`, `CLOUD_KEY`, `CLOUD_SECRET`. Remove `MOBILE_OTP_MINUTES` and `JWT_EXPIRES_IN`.
Do not commit `.env`. Rate limits are in memory, so run ONE instance (or add a Redis store before scaling).

## Layout
`src/config` env + game rules · `src/models` · `src/services` (rewards, tasks, pets, mail, push, Cloudinary) ·
`src/controller` · `src/routes` · `src/middleware` (auth, pet access, rate limits) · `docs/API.md` endpoint reference.
