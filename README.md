# EAS — Event Attendance System

A multi-tenant SaaS for tracking attendance at events via personal signed QR codes. v1 ships with **events only**. v2 (classroom) is out of scope.

## How it works

- Every attendee has a **personal, signed QR code** (HS256 JWT bound to their attendee ID + an event ID + a 24h window past event end)
- Event entry uses a single **PWA scanner** held by a facilitator — they walk the line, scan, scan, scan
- The scanner is **offline-first**: scans queue in IndexedDB and replay on reconnect, with server-side idempotency
- The admin web lets organizers create events, bulk-import attendees, download printable QR sheets, watch live attendance, and manually check in latecomers

## Tech stack

| Layer | Choice |
|---|---|
| Backend | NestJS 10 + Prisma 5 + PostgreSQL 16 (Docker) |
| Frontend (admin) | Next.js 14 App Router |
| Frontend (scanner) | Vite + React 19 + vite-plugin-pwa + @zxing/browser |
| Auth (admins) | Email + password → JWT (HS256) |
| Auth (attendees, in QR) | HS256 JWT (payload `{aid, eid, iat, exp}`) signed with `QR_HMAC_SECRET` |
| Deployment | PM2 + Caddy reverse proxy on a single VPS |

## Quick start (dev)

```bash
# 1. Postgres (Docker, named volume)
docker run -d --name eas-pg --restart unless-stopped \
  -v eas-pg-data:/var/lib/postgresql/data \
  -p 5432:5432 \
  -e POSTGRES_USER=eas \
  -e POSTGRES_PASSWORD=...  # see /tmp/eas-creds.txt or set your own
  -e POSTGRES_DB=eas \
  postgres:16-alpine

# 2. Install
pnpm install --ignore-scripts

# 3. Migrate + seed
cd services/api
pnpm exec prisma migrate deploy
pnpm exec ts-node --transpile-only prisma/seed.ts

# 4. Boot all three services (separate terminals)
cd services/api     && pnpm dev   # :4000
cd services/web     && pnpm dev   # :3011
cd services/scanner && pnpm dev   # :5173
```

Default seed: org = **Lapu-Lapu City College** (slug `llcc`), admin = `admin@llcc.eas.arrowtest.site`.

## API surface

All routes under `/api/v1`. Full schema lives in the brief; the highlights:

- `POST /auth/login` → `{ token, user }` (admin)
- `POST /events/:eventId/attendees/:attendeeId/token` → `{ token, url, expiresAt }` (admin helper for the demo + scanner bootstrap)
- `GET /events/:eventId/attendees/:attendeeId/qr.svg` → signed QR image (admin)
- `GET /orgs/:orgId/events/:eventId/roster-qr-sheet.pdf` → printable 12/page PDF
- `POST /attendance` → `{ eventId, jwt, scannedAt, scannerDeviceId, idempotencyKey }` → 5-status response: `checked_in | already_checked_in | not_in_roster | invalid_token | event_closed`
- `GET /events/:eventId/scanner-bootstrap` → `{ event, roster }` for offline caching (public, no auth)
- `GET /check-in/:eventId` → human check-in fallback (public, returns the attendee name + confirm button)
- `POST /check-in/:eventId/confirm` → records via the same path as the scanner

## Scanner flow

1. Facilitator opens `https://scanner.eas.arrowtest.site/scan/<eventId>`
2. PWA calls `/scanner-bootstrap` → caches roster in IndexedDB
3. Camera activates (zxing), decodes QRs continuously
4. Each scan extracts the JWT from the URL, posts to `/attendance`
5. Server returns one of 5 statuses → PWA flashes green/yellow/red with the attendee name
6. If offline: scan is queued in IndexedDB; replays on reconnect with exponential backoff; unique constraint on `(eventId, idempotencyKey)` dedupes replays

## Deployment

See [`deploy/README.md`](./deploy/README.md) for the PM2 + Caddy + secrets setup. TL;DR:

```bash
sudo bash -c 'set -a; . /etc/eas/secrets.env; set +a; \
  pm2 start /home/kyle.t/Workspace/eas/deploy/pm2.ecosystem.config.cjs && \
  pm2 save && \
  pm2 startup'
```

## Tests

- Critical paths covered by `tests/critical-paths.test.ts`:
  - QR sign/verify roundtrip
  - Idempotency: same key twice → 1 DB row, 2nd response is `already_checked_in`
  - Already-in-event: scan twice → 2nd is `already_checked_in`
  - Not-in-event: scan → `not_in_roster`
  - Expired/tampered JWT: scan → `invalid_token`
  - CSV import: malformed row → reported in `errors`, no crash
- End-to-end: `/tmp/checkpoint1.py` exercises the full backend (5 status responses + idempotency + summary + QR rendering)

## Layout

```
eas/
├── services/
│   ├── api/         NestJS backend
│   ├── web/         Next.js admin
│   └── scanner/     Vite PWA scanner
├── packages/
│   └── shared/      zod DTOs + entity types
├── deploy/
│   ├── pm2.ecosystem.config.cjs
│   ├── Caddyfile.snippet
│   └── README.md
└── README.md
```

## Status

v1 backend ✓ · v1 PWA ✓ · v1 admin web ✓ · deploy to `*.arrowtest.site` (Caddy sudo pending)
