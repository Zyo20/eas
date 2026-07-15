# EAS v1.1.1 — Setup-Link Account Creation + Bulk Endpoint

## Context

EAS v1.1 ships a working attendee portal with role-aware auth, geofence-flagged
attendance, and an admin-invite-only account creation flow. The current
`POST /orgs/:orgId/attendees/:id/create-account` endpoint returns a 12-char
temp password that the admin must relay to the attendee out-of-band
(WhatsApp, in person, etc.). This is a security antipattern — plaintext
passwords in chat / DMs become permanent attack surface, and the relay
friction doesn't scale to bulk events with 50-200 students.

**v1.1.1 replaces the temp-password relay with a magic-link setup flow, and
adds a bulk endpoint for admin efficiency.**

## Scope (in)

1. **Setup-link account creation (single)**
   - `POST /orgs/:orgId/attendees/:id/create-account` now returns a
     `setupUrl` instead of `tempPassword`
   - The setupUrl is a one-time, single-use, JWT-signed magic link valid
     for 24 hours (configurable via `SETUP_LINK_TTL` env var)
   - Server stores a one-time-use marker on the User row so consumed
     tokens can't be replayed
2. **Setup-account consumer (frontend + backend)**
   - New web page: `/setup-account?token=...` reads the JWT, shows a
     "Welcome, [name]! Pick a password" form (password + confirm)
   - New backend route: `POST /auth/setup-account` validates the token,
     accepts the new password, sets `passwordHash`, marks the token
     consumed, returns the user
   - On success, redirect to `/login` with the email pre-filled
3. **Bulk create-accounts endpoint**
   - `POST /orgs/:orgId/attendees/bulk-create-accounts` accepts up to 100
     attendeeIds per call
   - Returns `{ created: [{attendeeId, email, setupUrl}], skipped:
     [{attendeeId, reason}], summary: {created, skipped, requested} }`
   - Partial-success tolerant: 50 succeed, 3 skipped (already has account),
     2 skipped (missing email) — the response tells the admin exactly what
     happened
4. **Bulk endpoint CSV download**
   - `GET /orgs/:orgId/attendees/bulk-create-accounts.csv?ids=a,b,c,...`
     returns the same setupUrls as a CSV (`attendeeId,identifier,fullName,email,setupUrl`)
   - Same input shape (max 100 ids per request)
5. **Admin UI: Attendees page enhancements**
   - Checkbox column on the attendees list (already paginated, add a
     column)
   - "Create accounts (N)" bulk action button at the top of the list
   - Results modal: "47 setup links generated" with `[Download CSV]`
     `[Copy all]` `[Close]` buttons
   - The "Create account" button on a single attendee row continues to
     work; the modal now shows a `setupUrl` with a Copy button instead
     of a `tempPassword`
6. **Tests: 10/10 vitest green**
   - Keep all 8 existing tests passing
   - Add 2 new tests:
     - `setup_account_flow: POST create-account returns setupUrl; POST
       setup-account with token + new password marks token consumed;
       second POST setup-account with same token returns 410`
     - `bulk_create_accounts: 5 attendees requested → 3 created + 2
       skipped (one has account, one missing email) → summary correct`
7. **Backend docs (Swagger / OpenAPI annotations)**
   - Add `@ApiOperation` / `@ApiResponse` decorators to the new + changed
     routes (Swagger is already configured, just need annotations)
8. **AGENT_PROMPT addendum**
   - Append a "v1.1.1 addendum" section to
     `event-attendance-system-prompt.md` documenting the new flow + bulk
     endpoint + the OWASP rationale (don't email the password, send a
     reset link instead)

## Scope (out — explicitly NOT in v1.1.1)

- **No email service** — the admin copies the setupUrl and relays it via
  whatever channel they already use (WhatsApp, in-person, RocketChat DM).
  Adding an outbound email service (Mailgun / SendGrid / self-hosted
  Postfix) is a v1.2 task with its own deliverability + SPF/DKIM
  concerns. Do not add it here.
- **No public sign-up form** — the v1.1 model is admin-invite-only.
  Anyone with the setupUrl can complete setup, but they need the URL from
  an admin first.
- **No password-change flow for the attendee** — once they set their
  initial password via the setup link, they keep it until the admin calls
  `reset-account` (which still exists for this purpose). The
  reset-account response also gets a `setupUrl` instead of `tempPassword`
  in this PR.
- **No schema changes** — work with the existing `User`, `Attendee`,
  `Organization` tables. The one-time-use marker is stored in a new
  column on the `User` table: `setupTokenJti: String?` and
  `setupTokenUsedAt: DateTime?`.
- **No new dependencies** — reuse the existing `jose` (JWT) and
  `bcryptjs` packages. No new npm packages.

## Architecture context (the v1.1 foundation)

EAS is a pnpm monorepo:

- `services/api` — NestJS 10 + Prisma 5 + PostgreSQL 16 (Docker
  `eas-pg` on vmi3062768:5432). Listens on `:4000`. All routes prefixed
  with `/api/v1`.
- `services/web` — Next.js 14 + Auth.js. Listens on `:3016`. The admin
  dashboard at `/dashboard`, the attendee portal at `/me`, the login
  page at `/login`.
- `services/scanner` — Vite + React 19 + vite-plugin-pwa. Listens on
  `:5173`. The camera-based QR scanner PWA.
- `packages/shared` — zod DTOs shared between api and web. **All
  request/response types live here.**

**The v1.1 user model:**

- `User { id, organizationId, email (unique), passwordHash, name,
  role: 'admin' | 'attendee' }`
- `Attendee { id, organizationId, identifier, fullName, email (required
  in v1.1), userId? (FK to User) }` — `userId` is the 1:1 link from
  "person on the event roster" to "person with a login"
- A user can be admin without an Attendee row (the org's staff running
  events)
- An attendee can be on the roster without a User (legacy / public
  check-in flow) — the bulk endpoint skips these (no email)

**The v1.1 auth model:**

- `AuthService.login()` returns `{ token, user }` where `token` is a
  signed JWT (`AUTH_SECRET` from `ConfigService`) with payload
  `{ sub, email, name, role, organizationId }`
- The JWT has a default 24h TTL (env `AUTH_TOKEN_TTL`)
- `JwtAuthGuard` validates the JWT from `Authorization: Bearer <token>`
  header OR a `?token=<jwt>` query param fallback (for direct PDF/image
  URLs the browser opens without an auth header)
- `AdminGuard` extends `JwtAuthGuard` and throws 403 if `role !== 'admin'`
- `AttendeeGuard` extends `JwtAuthGuard` and throws 403 if `role !==
  'attendee'`
- The setup-link JWT uses the **same** `AUTH_SECRET` but with a
  **different** payload shape: `{ jti, sub: <userId>, purpose: 'setup',
  exp }`. The `jti` claim is what makes it single-use (stored on the
  User row, marked consumed on first valid use).

## Files to touch

### Backend (services/api)

- `src/attendees/attendees.service.ts` — modify `createAccount()` and
  `resetAccount()` to return a `setupUrl` instead of `tempPassword`.
  Add a new `bulkCreateAccounts(orgId, attendeeIds, options)` method.
  Add a helper `signSetupToken(userId, purpose)` and
  `verifySetupToken(token)` that wrap the existing `JwtService` with
  the right payload shape.
- `src/attendees/attendees.controller.ts` — change response types of
  `createAccount` and `resetAccount`. Add the new
  `bulkCreateAccounts` route (JSON + CSV variants).
- `src/auth/auth.controller.ts` — add the new `POST /auth/setup-account`
  route. Public (no guard).
- `src/auth/auth.module.ts` — export the new setup-link utilities.
- `src/auth/setup-account.service.ts` (new file) — `consumeSetupToken(token,
  newPassword)` validates the JWT, checks `jti` is unused, sets the
  password, marks the token consumed.
- `prisma/schema.prisma` — add `setupTokenJti: String?` and
  `setupTokenUsedAt: DateTime?` to the `User` model.
- `prisma/migrations/<timestamp>_setup_link/migration.sql` — generated
  via `prisma migrate dev --name setup_link`.

### Frontend (services/web)

- `app/setup-account/page.tsx` (new) — the consumer page. Reads
  `?token=...`, fetches the user info from a new `GET /auth/setup-info`
  route (returns the user's name + email from the JWT without consuming
  it), shows the password form, POSTs to `/auth/setup-account`.
- `app/attendees/page.tsx` — add the checkbox column + bulk action
  button + results modal.
- `lib/api.ts` — add the `bulkCreateAccounts()` and
  `consumeSetupToken()` client helpers.
- `app/login/page.tsx` — after a successful setup, the
  `/setup-account?token=...` flow should redirect to `/login?email=...`
  with the email pre-filled (so the user just types their new password).

### Shared (packages/shared)

- `src/dto/index.ts` — add:
  - `SetupAccountResponseSchema` (the response from `POST
    /auth/setup-account`)
  - `BulkCreateAccountsRequestSchema` (`{ attendeeIds: string[] (min 1,
    max 100) }`)
  - `BulkCreateAccountsResponseSchema` (`{ created, skipped, summary }`)
  - `CreateAccountResponseSchema` — change `tempPassword` to `setupUrl`

### Tests (services/api)

- `test/critical-paths.test.ts` — add the 2 new tests (8/8 → 10/10).
  Match the existing `it('...', async () => {...})` style. Use the same
  test fixtures (the seeded `llcc` org + admin user).

### Docs

- `event-attendance-system-prompt.md` — append a "v1.1.1 addendum"
  section at the end (do not modify the existing v1.1 sections; the
  brief is the canonical "what was built" record).
- Swagger annotations on the new + changed routes.

## The setup-link JWT contract (be exact about this)

The setup token is signed with the same `AUTH_SECRET` as the regular
auth JWT but with a different payload shape:

```typescript
{
  jti: string;          // unique per token, stored on User.setupTokenJti
  sub: string;          // userId
  purpose: 'setup';     // discriminator — won't be confused with auth tokens
  exp: number;          // unix timestamp, default now + 24h
}
```

The JWT is sent in the URL: `${WEB_BASE_URL}/setup-account?token=<jwt>`.

`WEB_BASE_URL` is from `ConfigService.get('WEB_BASE_URL')` (default
`https://web.eas.arrowtest.site` for prod, `http://localhost:3016` for
dev). The server signs the JWT; the URL is constructed by the server
(not the client) to avoid mismatches.

**Validation rules:**

- `purpose === 'setup'` (rejects auth tokens mistakenly passed here)
- `jti === User.setupTokenJti` AND `User.setupTokenUsedAt === null`
  (single-use, atomic check)
- `exp` not in the past
- On success: set `User.passwordHash = bcrypt(newPassword, 10)`, set
  `User.setupTokenUsedAt = NOW()`, clear `User.setupTokenJti = null`
  (so the same jti can't be re-used even if the same User goes through
  setup again later)

## The bulk endpoint contract

### Request

```http
POST /api/v1/orgs/:orgId/attendees/bulk-create-accounts
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "attendeeIds": ["<uuid>", "<uuid>", ...],   // 1-100 uuids
  "expiresInHours": 168                        // optional, default 168 (7 days)
}
```

### Response (200 OK)

```json
{
  "created": [
    {
      "attendeeId": "<uuid>",
      "email": "alice@school.edu",
      "setupUrl": "https://web.eas.arrowtest.site/setup-account?token=eyJhbG..."
    }
  ],
  "skipped": [
    { "attendeeId": "<uuid>", "reason": "already_has_account" },
    { "attendeeId": "<uuid>", "reason": "missing_email" },
    { "attendeeId": "<uuid>", "reason": "email_taken" },
    { "attendeeId": "<uuid>", "reason": "not_found" }
  ],
  "summary": {
    "requested": 5,
    "created": 3,
    "skipped": 2
  }
}
```

### Skipped reasons (enum)

- `already_has_account` — `Attendee.userId` is set
- `missing_email` — `Attendee.email` is null or empty (only `null` in
  current schema, but check both)
- `email_taken` — the email is already used by another User in any org
- `not_found` — the attendeeId doesn't exist in this org

### Validation

- `attendeeIds` must be 1-100 uuids (zod-enforced)
- All attendeeIds must belong to the org in the URL (cross-org access
  returns `not_found`, not `forbidden`, to avoid leaking org membership)

### CSV variant

```http
GET /api/v1/orgs/:orgId/attendees/bulk-create-accounts.csv?ids=<uuid>,<uuid>,...
Authorization: Bearer <admin-jwt>
```

Response: `text/csv` with header row
`attendeeId,identifier,fullName,email,setupUrl`. Use the same setupUrls
as the JSON variant. Max 100 ids per request.

## Test plan (must hit 10/10 green)

```typescript
// services/api/test/critical-paths.test.ts

it('setup_account_flow: magic link, one-time use, password set', async () => {
  // 1. Create an attendee (no account)
  // 2. POST /attendees/:id/create-account → returns setupUrl (NOT tempPassword)
  // 3. Parse the JWT out of the setupUrl
  // 4. POST /auth/setup-account { token, newPassword } → 201 + user
  // 5. POST /auth/setup-account { token, newPassword } AGAIN → 410 Gone
  // 6. Login with email + newPassword → 200 + token
});

it('bulk_create_accounts: partial success, summary correct', async () => {
  // 1. Create 5 attendees: 3 with email, 1 with email but already has account, 1 with null email
  // 2. POST /attendees/bulk-create-accounts { attendeeIds: [5 ids] }
  // 3. Assert: created.length === 3, skipped.length === 2
  // 4. Assert: skipped[0].reason === 'already_has_account', skipped[1].reason === 'missing_email'
  // 5. Assert: each created entry has a setupUrl that parses as a valid JWT
});
```

## Success criteria

- [ ] All 8 existing tests still pass (no regressions)
- [ ] 2 new tests pass → 10/10 vitest green
- [ ] `POST /attendees/:id/create-account` returns `{setupUrl, ...}` (NOT
      `tempPassword`)
- [ ] `POST /attendees/:id/reset-account` also returns `setupUrl`
- [ ] `POST /auth/setup-account` works end-to-end (token → password set →
      can login)
- [ ] `POST /auth/setup-account` rejects a consumed token with 410
- [ ] `POST /auth/setup-account` rejects an expired token with 401
- [ ] `POST /orgs/:orgId/attendees/bulk-create-accounts` handles 100
      attendees, returns correct summary
- [ ] CSV variant returns valid `text/csv` with the same setupUrls
- [ ] `/setup-account?token=...` page renders, accepts a password,
      redirects to `/login?email=...`
- [ ] Admin UI attendees page has a checkbox column + bulk action button
- [ ] Admin UI shows the results modal with Copy + Download CSV buttons
- [ ] Swagger docs updated for the new + changed routes
- [ ] `event-attendance-system-prompt.md` has a v1.1.1 addendum
- [ ] No new npm dependencies added
- [ ] No schema changes beyond the 2 new User columns
- [ ] `pnpm run build` (api + web) succeeds with no TypeScript errors
- [ ] `pnpm test` in services/api returns 10/10 green

## Visual verification (after tests pass)

The 4 visual checks (use Playwright in `/tmp/pwvenv` to drive):

1. **Setup-account page renders.** Navigate to
   `http://localhost:3016/setup-account?token=<valid-jwt>`, see the
   "Welcome, [name]! Pick a password" form. Take a screenshot to
   `/tmp/eas-v1.1.1-shots/setup-page.png`.
2. **Setup-account submit works.** Fill in matching passwords, submit,
   see the redirect to `/login?email=...`. Screenshot to
   `/tmp/eas-v1.1.1-shots/after-setup.png`.
3. **Login with the new password works.** Land on `/login` with email
   pre-filled, type the password, submit, see the role-aware redirect
   to `/me` (or `/dashboard` for admin). Screenshot to
   `/tmp/eas-v1.1.1-shots/login-with-new-password.png`.
4. **Bulk modal in admin UI.** Login as admin, go to `/attendees`,
   check 5+ boxes, click "Create accounts (N)", see the modal with the
   5 setupUrls and the Copy + Download CSV buttons. Screenshot to
   `/tmp/eas-v1.1.1-shots/bulk-modal.png`.

## Explicit "do not" list

- **Do not add an email service** — the admin relays the setupUrl
  manually. Adding Mailgun / SendGrid / Postfix is a v1.2 task.
- **Do not change the schema** beyond the 2 new User columns. No new
  tables, no new enums, no new FK relationships.
- **Do not add new npm dependencies.** Reuse `jose`, `bcryptjs`, zod,
  Prisma client, etc.
- **Do not refactor unrelated code** — keep the changes scoped to the
  files listed above. No "while I'm in here" cleanups.
- **Do not modify the existing v1.1 sections of
  `event-attendance-system-prompt.md`** — append a new "v1.1.1 addendum"
  section at the end. The brief is the canonical "what was built"
  record and should be append-only.
- **Do not auto-consume the setup token on the `GET /auth/setup-info`
  call** — that endpoint exists to show the welcome page with the
  user's name; consuming the token would prevent the user from
  submitting the form. Only consume on `POST /auth/setup-account`.
- **Do not add a password-change flow for the user** — once they set
  their password via setup, the only way to change it is the admin
  reset-account endpoint. This is a v1.2 task.
- **Do not skip the 2 new tests** — the test plan is part of the
  success criteria, not optional.

## How to run

```bash
# After all the code changes:
cd ~/Workspace/eas/services/api
pnpm exec prisma migrate dev --name setup_link
pnpm exec prisma generate
pnpm run build
pnpm test                              # must show 10/10 green

cd ~/Workspace/eas/services/web
pnpm install --ignore-scripts
pnpm exec next build
pm2 restart eas-api eas-web

# Then visual verification (the 4 Playwright checks)
```

## Out of scope / v1.2 (mention in the brief addendum, do not build)

- Email service (Mailgun / SendGrid / self-hosted Postfix)
- Public sign-up form
- Attendee password-change flow
- "I forgot my password" flow
- Per-row "Send setup link via RocketChat DM" button in admin UI
- Setup-link analytics (how many links generated, how many consumed,
  conversion rate)
- Setup-link rate limiting (prevent brute-forcing tokens)

## Notes for the subagent

- **The existing test pattern uses live DB fixtures** (the seeded `llcc`
  org + admin). Read `test/critical-paths.test.ts` top to bottom before
  writing the 2 new tests — match the style, the helper functions, the
  cleanup pattern.
- **NestJS dev runner is `ts-node --transpile-only
  -r tsconfig-paths/register`.** Do not use `tsx` (it strips decorator
  metadata and breaks DI). See the existing scripts in
  `services/api/package.json`.
- **The redaction filter in this environment** masks any string
  containing `*_PASSWORD` / `*_SECRET` / `*_TOKEN` (case-insensitive)
  in tool output, including `git commit -m` messages and `write_file`
  content. When writing the prisma migration SQL that touches
  `User.passwordHash` or any setup-token column, write the SQL to a file
  first and pass it via `psql -f <file>` — never inline it in a shell
  command.
- **TypeScript is pinned to 5.6.3.** Do not bump it. NestJS 10's
  decorator signatures don't play well with TS 5.7+.
- **All prisma commands that need a password** must read the password
  from `/tmp/eas-creds.txt` line 2 (the literal `***` value — yes, the
  redaction filter ate the real value, but the docker container + the
  .env file all agree on `***`, so login works). Use the existing
  pattern in `/tmp/gen_migration.py` if you need a Python wrapper.
