# Event Attendance System — Coding Agent Build Prompt

> **Purpose:** A complete, self-contained build brief for a coding agent (Codex, Claude Code, or equivalent) to design, scaffold, and implement a v1 of the Event Attendance System. Read this end-to-end before writing a single line of code. The decisions here are **intentional and committed** — do not re-litigate them. If something is unclear, ask the user before inventing.

---

## 0. Project Overview

**Product name (working):** Event Attendance System (EAS). Rename if the user prefers.

**What it does:**
A multi-tenant SaaS for tracking attendance at events and (in v2) classrooms. v1 ships with **events only**. The killer design: every attendee has a **personal, signed QR code** that contains their identity. Event entry uses a single **PWA scanner** held by a facilitator — they walk down the line, scan each attendee's QR, and the system records the check-in.

**Why this shape:**
- One scanner per entry point, not one scanner per attendee → no herd effect, no network round-trip race
- Personal QRs cannot be screenshotted and reused (defense against the #1 attack on event QR systems)
- Offline-first scanner works in poor venue Wi-Fi (the rule, not the exception, at school events)

**Stage:** v1 = events only. Classroom attendance is **explicitly v2** and out of scope for this brief. Do not build classroom features even if they seem easy to add.

---

## 1. Tech Stack (locked)

| Layer | Choice | Reason |
|---|---|---|
| Backend | **NestJS** (TypeScript) | Matches Arrowsoft house style; modular DI scales to v2 classroom |
| ORM | **Prisma** | Type-safe, migrations, matches the existing Arrowsoft products |
| Database | **PostgreSQL** | User specified. Use PG-native features (UUID, `gen_random_uuid()`, partial indexes) |
| Frontend (admin) | **Next.js 14 App Router** (TypeScript) | Reuses existing Arrowsoft components and `web` service pattern |
| Frontend (scanner) | **PWA** (Vite + React + Workbox) | Must work offline, installable on Android/iOS, no app store |
| Auth (org admins) | **Auth.js (NextAuth) with Credentials provider** | Email + password; defer OAuth to v2 |
| Auth (attendees) | **Signed JWT in QR payload** | Stateless, tamper-evident, no DB lookup at scan time |
| Deployment | Single VPS via **PM2** + **Caddy** reverse proxy | Matches Arrowsoft infra. Scanner PWA is a static build served by Caddy |
| QR generation | **`qrcode`** (npm) on the server, returns SVG or PNG | Avoid client-side crypto for signing |
| QR scanning (PWA) | **`@zxing/browser`** or **`html5-qrcode`** | Battle-tested, works in mobile WebKit/Chromium |

**Don't introduce:** Docker for the app, Redis, GraphQL, a message queue, microservices, Kubernetes, OAuth providers, payment processing, email service. None of these are needed for v1.

---

## 2. Data Model (locked)

Use Prisma. Postgres under the hood. UUIDs everywhere as primary keys. Soft-delete with `deleted_at` only on `Organization` and `Event` (audit trail); hard-delete on `Attendee` is acceptable.

```prisma
// schema.prisma — v1

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum OrgType {
  SCHOOL
  ORG
}

enum EventStatus {
  DRAFT
  OPEN
  CLOSED
}

enum AttendanceSource {
  SCAN
  MANUAL
  IMPORT
}

model Organization {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  slug      String   @unique
  type      OrgType
  createdAt DateTime @default(now())
  deletedAt DateTime?

  users     User[]
  events    Event[]
  attendees Attendee[]

  @@index([slug])
}

model User {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @db.Uuid
  email          String   @unique
  passwordHash   String
  name           String
  role           String   @default("admin") // single-tenant role for v1; v2 = RBAC
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])
  events       Event[]

  @@index([organizationId])
}

model Attendee {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @db.Uuid
  // Identity
  identifier     String   // student/org ID — human-meaningful, scoped to org
  fullName       String
  email          String?
  // QR token secret — server signs the QR with HMAC(secret, attendee_id)
  // Secret is rotated only on explicit regenerate; never log it
  qrSecret       String   @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  // Optional photo URL (for v2 fraud check; stored as opaque string in v1)
  photoUrl       String?
  createdAt      DateTime @default(now())

  organization Organization         @relation(fields: [organizationId], references: [id])
  records     AttendanceRecord[]

  // Identifier is unique per org, not globally (multiple schools can both have "2024-00123")
  @@unique([organizationId, identifier])
  @@index([organizationId])
}

model Event {
  id             String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String      @db.Uuid
  name           String
  description    String?
  location       String?
  startsAt       DateTime
  endsAt         DateTime
  status         EventStatus @default(DRAFT)
  createdById    String      @db.Uuid
  createdAt      DateTime    @default(now())
  deletedAt      DateTime?

  organization Organization       @relation(fields: [organizationId], references: [id])
  createdBy    User               @relation(fields: [createdById], references: [id])
  rosters      EventRoster[]
  records      AttendanceRecord[]

  @@index([organizationId, startsAt])
  @@index([status])
}

model EventRoster {
  // Join table: which attendees are expected at which event
  // Allows pre-loading scanner with the right list
  eventId    String   @db.Uuid
  attendeeId String   @db.Uuid
  addedAt    DateTime @default(now())

  event    Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  attendee Attendee @relation(fields: [attendeeId], references: [id], onDelete: Cascade)

  @@id([eventId, attendeeId])
  @@index([attendeeId])
}

model AttendanceRecord {
  id              String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  eventId         String           @db.Uuid
  attendeeId      String           @db.Uuid
  // Client-generated UUID, the idempotency key for offline-safe re-sync
  idempotencyKey  String           @db.Uuid
  // When the scanner actually scanned (may be earlier than createdAt if queued offline)
  scannedAt       DateTime
  // Server clock at the moment of record acceptance
  createdAt       DateTime         @default(now())
  source          AttendanceSource @default(SCAN)
  // Geo + scanner info for fraud audit
  scannerLat      Decimal?         @db.Decimal(9, 6)
  scannerLng      Decimal?         @db.Decimal(9, 6)
  scannerDeviceId String?
  // Free-form note from manual entry
  note            String?

  event    Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  attendee Attendee @relation(fields: [attendeeId], references: [id], onDelete: Cascade)

  // The crucial offline-safety constraint: same idempotency key cannot be inserted twice
  @@unique([eventId, idempotencyKey])
  // One physical person can only check in once per event (additional check, server-side)
  @@unique([eventId, attendeeId])
  @@index([eventId, scannedAt])
}
```

**Notes on the schema:**
- The `unique([eventId, idempotencyKey])` is the **idempotency boundary** for offline sync. The scanner generates a UUID at scan time, sends it with the check-in POST, and retries the same key until the server responds 2xx. Duplicates are silently deduped at the DB level.
- The `unique([eventId, attendeeId])` is a **defense-in-depth** — even if a client somehow sends two different idempotency keys for the same attendee, the DB rejects the second one.
- The `qrSecret` is used to sign the QR token (see §3). Rotating it invalidates all of an attendee's old QRs, which is the desired "regenerate" behavior.
- `EventRoster` is the join table. It allows an event to be created for a subset of the org's attendees (e.g., "all CS students" for a CS department event), and lets the scanner pre-load only the right list.

---

## 3. QR Token Format (locked)

The personal QR encodes a URL that, when scanned, validates the attendee and is the basis for the check-in POST. The URL must be:

- **Short** (fits in a small QR at low error correction)
- **Tamper-evident** (cannot be modified without breaking the signature)
- **Rotatable** (revoke a single attendee's QR without affecting others)

**Format:**
```
https://<host>/check-in/<eventId>?t=<jwt>
```

Where `<jwt>` is a **JWT (HS256)** signed with `QR_HMAC_SECRET` (server env var) with this payload:
```json
{
  "aid": "<attendeeId>",
  "eid": "<eventId>",
  "iat": <issuedAt>,
  "exp": <expiresAt>  // event.endsAt + 24h
}
```

**Library:** `jsonwebtoken` (npm). Sign with HS256, not RS256 — no need for public-key infrastructure in v1.

**QR generation endpoint:** `GET /api/v1/events/:eventId/attendees/:attendeeId/qr.svg` (or `.png`).
- Server-side renders the QR using `qrcode` npm package
- Returns a downloadable, printable image
- v1 also includes a public "My QR" page where the attendee can view/save their own QR for this event (or for all their upcoming events, but v1 = per event)

**Scanner flow** (the meat of the system):
1. Facilitator opens the PWA scanner at `https://<host>/scan/<eventId>`
2. PWA fetches the event's `EventRoster` from the server and stores it in IndexedDB
3. Facilitator clicks "Start scanning" → camera activates
4. Each scan decodes the JWT from the QR
5. PWA verifies the JWT signature and `exp` locally (the PWA gets the QR's public verification copy of the secret — or, better, the PWA posts the raw token to the server and the server does the full verify; choose server-side verify for security)
6. PWA POSTs `{ eventId, jwt, scannedAt: <now>, scannerDeviceId, scannerLat, scannerLng, idempotencyKey }` to `POST /api/v1/attendance`
7. Server verifies JWT, looks up attendee, checks `EventRoster`, inserts `AttendanceRecord` (unique constraint on `(eventId, attendeeId)` gives the dedup)
8. Server returns 201 (new) or 200 (already checked in) with attendee name + scan count
9. PWA shows green flash + name + checkmark on success, red flash on duplicate/error

**Offline behavior (PWA):**
- All scans while offline are stored in IndexedDB with `idempotencyKey`, `scannedAt`, and the full POST body
- On reconnect (or when the user taps "Sync"), the PWA replays the queue in order
- Server is the source of truth — unique constraints dedupe regardless of how many times the same scan is replayed
- The roster fetch also caches in IndexedDB and is refreshed on every successful sync
- The PWA must clearly display "Offline — X scans queued" status

---

## 4. API Surface (v1)

All endpoints under `/api/v1`. JSON. Bearer token (JWT) for admin routes, server-signed event JWT in QR for scan routes.

### Auth (admin users)
- `POST /api/v1/auth/login` → `{ email, password }` → `{ token, user }`
- `POST /api/v1/auth/logout` → invalidate token (v1: client-side discard is fine, no blacklist)
- `GET /api/v1/auth/me` → current user

### Organizations
- `POST /api/v1/orgs` (super-admin only, but v1: just a CLI seeder) → create
- `GET /api/v1/orgs/:id` → details
- `PATCH /api/v1/orgs/:id` → update name/slug
- v1: **no public org-creation endpoint**. The test tenant is created via a seed script.

### Attendees
- `POST /api/v1/orgs/:orgId/attendees` → create one
- `POST /api/v1/orgs/:orgId/attendees/import` → CSV upload (multipart). Expected columns: `identifier, fullName, email?`. Returns `{ created, errors }`.
- `GET /api/v1/orgs/:orgId/attendees?cursor=&q=` → paginated, searchable
- `GET /api/v1/orgs/:orgId/attendees/:id` → details
- `PATCH /api/v1/orgs/:orgId/attendees/:id` → update fields
- `POST /api/v1/orgs/:orgId/attendees/:id/regenerate-qr` → rotates `qrSecret`, invalidates old QRs
- `DELETE /api/v1/orgs/:orgId/attendees/:id` → hard delete (cascades to records? NO — see note below)
  - **Note:** Hard-deleting an attendee should be blocked if they have any `AttendanceRecord`. Use soft-delete via `deleted_at` (add column if needed) or implement a "deactivate" flag in v1.1. For v1, just 409 with a clear error message.

### Events
- `POST /api/v1/orgs/:orgId/events` → create event with roster (array of `attendeeId`s)
- `GET /api/v1/orgs/:orgId/events?status=&from=&to=` → list
- `GET /api/v1/orgs/:orgId/events/:id` → details + roster
- `PATCH /api/v1/orgs/:orgId/events/:id` → update name/times/status
- `POST /api/v1/orgs/:orgId/events/:id/close` → set status=CLOSED
- `DELETE /api/v1/orgs/:orgId/events/:id` → soft-delete (sets `deletedAt`)
- `GET /api/v1/orgs/:orgId/events/:id/roster.csv` → export the roster as CSV (for printing badges)

### QR (the special one)
- `GET /api/v1/events/:eventId/attendees/:attendeeId/qr.svg` → signed QR image for that attendee at that event
- `GET /api/v1/events/:eventId/roster-qr-sheet.pdf` → bulk PDF with all QRs (paginated 12/page, 3×4 grid), for printing

### Attendance (the scan endpoint — PUBLIC, scanner-authenticated)
- `POST /api/v1/attendance` → `{ eventId, jwt, scannedAt, scannerDeviceId, scannerLat?, scannerLng?, idempotencyKey }` → `{ status: "checked_in" | "already_checked_in" | "not_in_roster" | "invalid_token" | "event_closed", attendee?: { id, fullName } }`
  - **No auth header** for this endpoint in v1. The signed JWT in the body IS the auth. (v2: add an event-scoped scanner PIN to prevent random phones from being able to scan.)
- `GET /api/v1/events/:eventId/attendance` → list records (admin view)
- `GET /api/v1/events/:eventId/attendance/summary` → `{ total, checkedIn, remaining, percent }`
- `GET /api/v1/events/:eventId/attendance/who-hasnt-arrived` → list of `EventRoster` attendees with no `AttendanceRecord`
- `POST /api/v1/events/:eventId/attendance/manual` → `{ attendeeId, note? }` for late check-ins / off-roster guests

### Scanner-bootstrap (PWA only)
- `GET /api/v1/events/:eventId/scanner-bootstrap` → `{ event, roster: [...], jwtPublicKey? }`
  - For v1: returns the full roster so the PWA can display "Scan to confirm: [Name]" feedback even before the round-trip completes
  - The roster includes only `{ id, fullName, identifier, photoUrl? }` — no secrets, no PII beyond name+id

---

## 5. Frontend Surfaces

### A. Admin web (Next.js)
- `/login` — email + password
- `/dashboard` — list of upcoming + recent events, click into one
- `/org/:orgId/events/:id` — event detail with:
  - QR sheet download (PDF, for printing)
  - "Open Scanner" button → opens the PWA scanner in a new tab at `/scan/:eventId`
  - Live attendance summary (poll every 5s, or use SSE in v1.1)
  - Manual check-in UI
  - Who-hasn't-arrived list with filter/search
- `/org/:orgId/attendees` — list/CRUD + CSV import
- `/org/:orgId/events/new` — event creation form with multi-select attendee picker
- `/me/qr` — show me MY QR for my upcoming events (if the admin user is also an attendee)

### B. Scanner PWA (Vite + React + Workbox, installable)
- `/scan/:eventId` — the only screen that matters
  - Top: connection status (Online / Offline — X scans queued)
  - Top: "Checked in: X / Y" live counter
  - Center: camera viewport with the QR region
  - Bottom: last scan result ("✓ Maria Santos — checked in" with green flash / "Already checked in" with yellow flash / "Not in roster" with red flash)
- Manifest: name, short_name, icons (192, 512), `start_url: /scan`, `display: standalone`, theme color
- Service worker (Workbox):
  - Pre-cache the app shell
  - Runtime cache for `scanner-bootstrap` and the QR `qrcode` image
  - Background sync API (or manual sync on reconnect) for the attendance POST queue
- IndexedDB schema:
  - `pendingScans` store: `{ idempotencyKey, eventId, jwt, scannedAt, scannerDeviceId, scannerLat, scannerLng, createdAt }`
  - `cachedRosters` store: `{ eventId, roster, cachedAt }`
  - `cachedEvents` store: `{ eventId, event, cachedAt }`

### C. Public-facing (v1 minimum)
- `/check-in/:eventId?t=<jwt>` — the URL the QR encodes. This is the human-facing fallback: if the scanner isn't working, the attendee can open this URL on their phone, see a "Confirm check-in for [Name]?" button, and tap. Server records it the same way. This is the "graceful degradation" path and the easiest way to make the system feel robust.

---

## 6. Project Structure

Monorepo. Two services + shared package.

```
eas/
├── package.json              (workspaces: services/*, packages/*)
├── pnpm-workspace.yaml       (or npm workspaces)
├── tsconfig.base.json
├── .env.example              (all required env vars documented)
├── README.md
├── services/
│   ├── api/                  (NestJS)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── auth/         (Auth.js integration, JWT issuance, guards)
│   │   │   ├── orgs/
│   │   │   ├── attendees/
│   │   │   ├── events/
│   │   │   ├── attendance/   (the scan endpoint, idempotency handling)
│   │   │   ├── qr/           (signed QR generation, PDF sheet rendering)
│   │   │   ├── prisma/       (PrismaModule, PrismaService)
│   │   │   └── common/       (filters, pipes, decorators, dto helpers)
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts       (creates the test org + admin user)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                  (Next.js 14 admin)
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── public/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── scanner/              (Vite + React + Workbox PWA)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── lib/
│       │   │   ├── db.ts             (IndexedDB wrapper)
│       │   │   ├── queue.ts          (offline scan queue)
│       │   │   ├── scanner.ts        (camera + zxing/html5-qrcode)
│       │   │   └── api.ts
│       │   ├── routes/
│       │   │   └── Scan.tsx          (the only screen)
│       │   └── styles/
│       ├── public/
│       │   ├── manifest.webmanifest
│       │   ├── icon-192.png
│       │   ├── icon-512.png
│       │   └── sw.ts                 (Workbox service worker)
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── shared/               (shared types, DTOs, validation)
│       ├── src/
│       │   ├── dto/
│       │   ├── types/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
└── deploy/
    ├── Caddyfile.snippet     (reverse proxy for the three services)
    ├── pm2.ecosystem.config.cjs
    └── README.md
```

---

## 7. Implementation Order

Build in this order. Each step is independently shippable and demoable. **The build is paced in three phases so the user can do an in-person review with the coding agent between phases — see §7.5.**

1. **Repo + monorepo skeleton** — pnpm workspaces, tsconfig.base, three empty services, `pnpm dev` boots all three
2. **DB schema + migration** — `prisma migrate dev --name init`, seed script creates the test org + admin user
3. **Auth (admin)** — login endpoint, JWT issuance, Auth.js integration in Next.js, `/me` endpoint
4. **Orgs + Attendees CRUD** — POST/GET/PATCH/DELETE, CSV import (use `papaparse`)
5. **Events CRUD** — POST/GET/PATCH/DELETE, roster join via `EventRoster`
6. **QR generation** — server-side, signed JWT, SVG/PNG response, PDF roster sheet (use `pdfkit`)
7. **Attendance POST endpoint** — the scan endpoint, idempotency, dedup, all 5 status responses
8. **Scanner PWA shell** — Vite scaffold, installable, camera permission, basic zxing decode (no queue yet)
9. **Scanner PWA + offline queue** — IndexedDB, replay on reconnect, status display
10. **Admin event detail page** — live summary, who-hasn't-arrived, manual check-in
11. **Public check-in URL** — `/check-in/:eventId?t=...` fallback flow
12. **Deploy to VPS** — PM2 + Caddy, all three services behind the same domain

### 7.5 Review Phases (MUST pause between)

The user is a hobby builder using a paid Ollama GPU tier. **Long, uninterrupted agent runs eat their GPU budget.** The build is split into three review checkpoints. **At each checkpoint, the agent must STOP, hand back the working artifact, and wait for explicit user approval before starting the next phase.** Do not "just keep going" — the GPU-time cost is real and the user wants to inspect, course-correct, and approve before more tokens burn.

**Checkpoint 1 — `BACKEND-FOUNDATION`** (after steps 1–7)
- The full backend is working: schema migrated, auth works, CRUD works, QR generation works, the attendance POST endpoint returns all 5 status responses correctly
- Deliverable: a video/terminal capture of the agent creating an org, an attendee, an event with a roster, generating a QR, and hitting the attendance endpoint with curl showing each of the 5 response shapes
- **STOP. Wait for user review.** Likely reviews: schema tweaks, endpoint naming, validation rules, error message copy
- Typical Ollama GPU time: ~30–60 min of agent work, depending on churn

**Checkpoint 2 — `PWA-SCANNER`** (after steps 8–9)
- The scanner PWA installs, scans a QR, queues offline, syncs back online, dedupes correctly
- Deliverable: a video capture on a real phone (or a localhost demo) of the PWA working through a full scan cycle including a Wi-Fi-off → reconnect → queue-replay
- **STOP. Wait for user review.** Likely reviews: UX feedback flash colors, queue size limits, scanner latency, camera permission flow
- Typical Ollama GPU time: ~45–90 min of agent work — this phase has the most UI iteration

**Checkpoint 3 — `FULL-STACK-DEPLOY`** (after steps 10–12)
- The admin pages render live attendance, manual check-in works, the public check-in URL works, the system is deployed to a real VPS behind a real domain
- Deliverable: a URL the user can visit + a 5-minute walkthrough video
- **STOP. Wait for user feedback.** Likely reviews: visual polish, dashboard copy, deployment choices
- Typical Ollama GPU time: ~30–60 min of agent work

**Rules at every checkpoint:**

- The agent's final response at a checkpoint must include: (a) what was built, (b) what's verified working, (c) what the user should test, (d) explicit "ready to proceed to phase X — confirm?" — not a continuation
- The agent must NOT start the next phase's first step until the user replies with explicit "go" / "approved" / "proceed" / "next phase"
- If the user is silent for 24+ hours, the agent must NOT ping them or re-run — the project sits until they come back
- If the user requests a small fix during a checkpoint (e.g. "rename `identifier` to `studentId`"), the agent makes the fix, verifies it didn't break anything, and waits again — still no auto-progression

**What the agent must NEVER do at a checkpoint:**
- "While I have momentum, let me also do step N" — that's bypassing the checkpoint
- "Since this is small, I'll do it now and report" — same
- "I'm going to start the next phase in the background while you review" — that's not a review, it's a fait accompli
- "I'll mark phase 1 done AND start phase 2 in the same turn" — same
- Combine two checkpoints' work into one response to "save you a turn" — the user is paying GPU time, the pause is the point

**Why this matters:** the user's GPU time is the explicit constraint, not the agent's flow. A smooth uninterrupted run that ends in "done, all 12 steps complete" might be the wrong deliverable if it cost 3 hours of GPU time the user wasn't ready to spend. The phased review is the cost-control mechanism, not just a project management nicety.

**Definition of done for v1:**
- Solo user can: sign in → create org → bulk-import 200 attendees via CSV → create event with all 200 on the roster → download QR PDF → print → install scanner PWA on phone → walk the line, scan all 200, with Wi-Fi off half the time → return to admin UI → see accurate "200/200 checked in" → download "who hasn't arrived" report
- The whole demo runs in <30 minutes from clean deploy

---

## 8. Critical Design Decisions (already made — don't re-open)

1. **Personal QR per attendee, NOT event QR.** See §3. The user explicitly chose this after pushback.
2. **One scanner per entry point, NOT one per attendee.** Walks the line, scan scan scan.
3. **JWT (HS256) in QR, not opaque random token.** Smaller, signed, self-contained. No DB lookup at scan time.
4. **Idempotency key per scan, server-side unique constraint.** The offline-safety contract. Non-negotiable.
5. **Server-side QR rendering, NOT client-side.** Avoids leaking the signing secret to the client.
6. **Classroom attendance is v2, NOT v1.** Don't add it even if it looks easy.
7. **No multi-tenant org signup in v1.** Seed script creates the test tenant. Defer to v1.1.
8. **No payment / billing in v1.** Free for now. Always.
9. **PWA scanner, not native app.** App store friction is a dealbreaker for a hobby project.
10. **PM2 + Caddy on a single VPS, not Docker + Compose, not Kubernetes.** Match the existing Arrowsoft deploy pattern.
11. **Attendees hard-delete is blocked if records exist.** Returns 409 with a clear error.
12. **`/check-in/:eventId?t=...` public URL is the graceful-degradation path.** Always exists, not optional.

---

## 9. What the Coding Agent Must Do

The agent is expected to:

1. **Read this prompt top to bottom** before writing any code
2. **Verify the environment**: Node 20+, pnpm, Postgres reachable, env vars set
3. **Implement in the order in §7**. Don't skip ahead, don't refactor earlier steps while working on later ones
4. **Use the schema in §2 verbatim** unless the user explicitly asks to change a field
5. **Use the API surface in §4 verbatim** for endpoint paths and request/response shapes
6. **Match the project structure in §6**
7. **Write tests** for the critical paths:
   - QR signing/verification roundtrip
   - Idempotency: same key twice → 201 then 200, only one DB row
   - Attendee already in event: scan twice → second is "already_checked_in"
   - Attendee not in event roster: scan → "not_in_roster"
   - Expired JWT: scan → "invalid_token"
   - CSV import: malformed row → reported in `errors`, doesn't crash
8. **Add a `README.md`** at the repo root with: prereqs, `pnpm dev` quickstart, env var list, demo flow link
9. **Add a `DEPLOY.md`** in `deploy/` with: PM2 + Caddy snippet, env var production values, Postgres backup note
10. **Report status at the end of each step** in §7 — what works, what's left, any deviations from this prompt and why

**What the agent must NOT do:**
- Introduce a different stack (Docker, GraphQL, Redis, etc.) without explicit user approval
- Build v2 features (classroom attendance, billing, multi-tenant org signup, OAuth)
- Skip the idempotency layer — it's the offline-safety contract
- Use the QR HMAC secret anywhere on the client side
- Push to a remote repository without explicit user approval
- Deploy to a VPS without explicit user approval
- Claim something works without actually running it (build, test, or smoke-check it)
- Write code with secrets hardcoded — use env vars, document them in `.env.example`

---

## 10. Environment Variables (for `.env.example`)

```bash
# Database
DATABASE_URL=postgresql://eas:eas@localhost:5432/eas

# Auth (admin)
AUTH_SECRET=                    # openssl rand -base64 32
AUTH_TOKEN_TTL=24h

# QR signing
QR_HMAC_SECRET=                 # openssl rand -base64 64

# Server
API_PORT=4000
WEB_PORT=3000
SCANNER_PORT=5173               # vite dev; in prod: served from Caddy
PUBLIC_BASE_URL=https://eas.example.com

# CORS (in dev, allow the scanner to hit the API)
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# Scanner telemetry (optional, v1.1)
ENABLE_SCANNER_GEO=true
```

---

## 11. Open Questions for the User

These are the things the agent should ask the user **before** starting step 1, not invent:

1. **Test tenant name + admin email?** (for the seed script)
2. **Local Postgres or a managed one?** (recommended: local docker postgres for dev, a managed one or local install for prod)
3. **Public domain?** (v1 can ship on `https://eas.<your-domain>` via Caddy — needs DNS pointing)
4. **VPS choice?** (any Ubuntu 22.04+ box works; recommended: a $5/mo Hetzner or DO droplet, or the existing Arrowsoft dev box)
5. **Email for password reset?** — v1 doesn't need this (no password reset flow), but confirm the user is OK with admin setting initial password via env var
6. **Git remote?** — create a new GitHub/GitLab repo, or skip remote for v1?

If the user says "just build it, use sensible defaults," the agent should:
- Use the alma mater name as the test org
- Use local Postgres
- Use `https://eas.local` for local dev (Caddy handles it, no real DNS)
- Skip the email reset flow entirely (v1 has none)
- Skip the git remote
- Document all of the above in the README

---

## 12. Success Criteria (v1 ships when ALL of these are true)

- [ ] Repo scaffolded, monorepo boots with `pnpm dev`
- [ ] Postgres schema migrated, seed creates test org + admin
- [ ] Admin can log in, see dashboard
- [ ] Admin can bulk-import 200 attendees via CSV
- [ ] Admin can create an event with 200-attendee roster
- [ ] Admin can download a QR PDF roster sheet
- [ ] Scanner PWA installs on Android, requests camera permission
- [ ] Scanner scans a personal QR, server returns 201, PWA shows green check
- [ ] Same QR scanned twice → server returns "already_checked_in", PWA shows yellow
- [ ] QR from a non-roster attendee → "not_in_roster", red
- [ ] Expired or tampered JWT → "invalid_token", red
- [ ] Scanner with Wi-Fi off → all scans queue, sync on reconnect, no duplicates
- [ ] Admin event detail page shows live "X / Y checked in" within 5s
- [ ] Admin can see "who hasn't arrived" list
- [ ] Admin can manual-check-in someone with a note
- [ ] Public `/check-in/:eventId?t=...` URL works as a fallback
- [ ] Deployed to a VPS, accessible via real domain
- [ ] README has the full demo flow
- [ ] `pnpm test` passes for the critical paths in §9

When all of these are checked, v1 is done. v2 (classroom) starts after the user has run v1 against a real event at their alma mater and decided what to keep.

---

## v1.1.1 Addendum — Setup-Link Account Creation + Bulk Endpoint

**Shipped:** 2026-07-15

### What changed

**v1.1 shipped a temp-password relay pattern: the admin generated a 12-char random password and relayed it to the attendee via WhatsApp / RocketChat DM / in-person. This is a security antipattern (OWASP: Forgot Password Cheat Sheet §Step 6 — never relay plaintext credentials; send a link instead). v1.1.1 replaces it with a magic-link setup flow.**

#### 1. Setup-link JWT (single-use)

- `POST /orgs/:orgId/attendees/:id/create-account` and `POST .../reset-account` now return `setupUrl` instead of `tempPassword`
- The `setupUrl` is `${WEB_BASE_URL}/setup-account?token=<jwt>` where the JWT has payload:
  ```json
  { "jti": "<uuid>", "sub": "<userId>", "purpose": "setup", "exp": <unix-ts> }
  ```
- The `jti` is stored on `User.setupTokenJti`. On first valid consume, `setupTokenUsedAt` is set and `setupTokenJti` is cleared → single-use guaranteed
- Default TTL: 168 h (7 days), configurable via `SETUP_LINK_TTL` env var (integer, hours)
- Re-issuing a link (via `create-account` or `reset-account`) overwrites `setupTokenJti`, invalidating the previous link

#### 2. New backend routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/auth/setup-info?token=...` | None | Peek at a setup token (returns name + email) without consuming |
| `POST` | `/auth/setup-account` | None | Consume a setup token, set new password; returns 410 if already used |
| `POST` | `/orgs/:orgId/attendees/bulk-create-accounts` | Admin | Create accounts for up to 100 attendees; partial-success |
| `GET` | `/orgs/:orgId/attendees/bulk-create-accounts.csv?ids=...` | Admin | Same as above, returns `text/csv` |

#### 3. Bulk endpoint contract

**Skipped reasons:** `already_has_account`, `missing_email`, `email_taken`, `not_found`

**Response shape:**
```json
{
  "created": [{ "attendeeId": "<uuid>", "email": "...", "setupUrl": "..." }],
  "skipped": [{ "attendeeId": "<uuid>", "reason": "already_has_account" }],
  "summary": { "requested": 5, "created": 3, "skipped": 2 }
}
```

#### 4. New frontend pages

- `/setup-account?token=...` — welcome form ("Welcome, [name]! Pick a password"), consumes token on submit, redirects to `/login?email=...`
- `/login` — now reads `?email=...` query param and pre-fills the email field

#### 5. Admin UI changes

- Attendees page: checkbox column (select-all + per-row), "Create accounts (N)" bulk action button
- Results modal: lists setup links with **Copy all** + **Download CSV** + **Close**
- Single-row "Create account" button now shows the `setupUrl` with a Copy button

#### 6. Schema changes

Two new optional columns on the `User` table:
```prisma
setupTokenJti     String?   // jti claim; cleared after first use
setupTokenUsedAt  DateTime? // set when the token is consumed
```

Migration: `prisma/migrations/<timestamp>_setup_link/migration.sql`

#### 7. No email service

The admin still relays the `setupUrl` manually (WhatsApp, RocketChat DM, in-person). Adding an outbound email service (Mailgun / SendGrid / self-hosted Postfix) is a **v1.2 task** with its own deliverability, SPF/DKIM, and unsubscribe concerns.

#### 8. Out of scope (v1.2)

- Email service for automatic setup-link delivery
- Public sign-up form
- Attendee password-change flow (after initial setup)
- "Forgot my password" self-service flow
- Per-row "Send via RocketChat DM" button
- Setup-link analytics (generated count, consumed count, conversion rate)
- Rate limiting on the setup-account endpoint
