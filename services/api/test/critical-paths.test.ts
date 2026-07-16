/**
 * EAS critical-path tests (brief §9 step 7).
 *
 * Spins up the full Nest app against the live `eas-pg` test DB.
 * Cleans up the tables it touches (AttendanceRecord, EventRoster, Event, Attendee)
 * before each test so the run is reproducible.
 *
 * Run with: `pnpm test` from services/api
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { execSync } from 'node:child_process';
import { vi } from 'vitest';
import { MailService } from '../src/mail/mail.service';
import { PrismaClient } from '@prisma/client';

let app: INestApplication;
let prisma: PrismaService;
let baseUrl: string;

beforeAll(async () => {
  // Load environment variables before doing database resolution
  loadEnvFile();

  // 1. Resolve dev database URL and construct test database URL (eas_test)
  const originalDbUrl = process.env.DATABASE_URL || 'postgresql://eas:eas@localhost:5432/eas';
  const urlObj = new URL(originalDbUrl);
  urlObj.pathname = '/eas_test';
  const testDbUrl = urlObj.toString();

  // 2. Automatically recreate 'eas_test' to ensure no stale migrations/data
  const adminPrisma = new PrismaClient({
    datasources: {
      db: {
        url: originalDbUrl,
      },
    },
  });
  try {
    // Terminate existing connections to test DB
    await adminPrisma.$executeRawUnsafe(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = 'eas_test' AND pid <> pg_backend_pid()
    `).catch(() => {});
    
    await adminPrisma.$executeRawUnsafe('DROP DATABASE IF EXISTS eas_test');
    await adminPrisma.$executeRawUnsafe('CREATE DATABASE eas_test');
    console.log('Re-created test database: eas_test');
  } catch (e: any) {
    console.warn('Could not recreate test database, attempting to proceed:', e.message);
  } finally {
    await adminPrisma.$disconnect();
  }

  // 3. Override standard DATABASE_URL variable with the isolated test DB URL
  process.env.DATABASE_URL = testDbUrl;

  // 4. Run migrations and seeds on the test database
  console.log('Deploying schema migrations to test database...');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
  });

  console.log('Seeding test database...');
  execSync('npx tsx prisma/seed.ts', {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
  });

  // 5. Build and initialize NestJS application
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.init();
  prisma = app.get(PrismaService);
  baseUrl = (await app.getHttpServer()).listen(0).address() as unknown as string;
});

// Helper to load env variables manually from .env file during test environment bootstrapping
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        if (key) {
          let val = match[2] || '';
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

afterAll(async () => {
  if (app) {
    await app.close();
  }
});

async function cleanDb() {
  // Order matters: FK chains
  await prisma.attendanceRecord.deleteMany();
  await prisma.eventRoster.deleteMany();
  await prisma.event.deleteMany();
  // Unlink attendees from users before deleting users (FK)
  await prisma.attendee.updateMany({ data: { userId: null } });
  // Delete only attendee-role users (leave the seeded admin intact)
  await prisma.user.deleteMany({ where: { role: 'attendee' } });
  await prisma.attendee.deleteMany();
}


async function seedOrgAndAdmin() {
  // Use existing org/admin (from prisma/seed.ts) — find by slug
  const org = await prisma.organization.findUnique({ where: { slug: 'llcc' } });
  if (!org) throw new Error('llcc org not seeded — run `pnpm run seed` first');
  const admin = await prisma.user.findFirst({ where: { organizationId: org.id } });
  if (!admin) throw new Error('no admin user for llcc — run `pnpm run seed` first');
  return { org, admin };
}

async function loginAdmin(): Promise<string> {
  const { admin } = await seedOrgAndAdmin();
  // Read password from the test secrets file. The dev password is P@$$w0rd
  // for the test org (matches the docker container password).
  // For test isolation, we just login with the known dev password.
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: admin.email, password: process.env.TEST_ADMIN_PASSWORD ?? 'P@$$w0rd' });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

async function seedAttendee(orgId: string, identifier: string, fullName: string, email: string) {
  return prisma.attendee.create({
    data: { organizationId: orgId, identifier, fullName, email },
  });
}

async function seedEvent(orgId: string, userId: string, startsAt: Date, endsAt: Date, roster: string[]) {
  return prisma.event.create({
    data: {
      organizationId: orgId,
      createdById: userId,
      name: 'Test event',
      startsAt,
      endsAt,
      status: 'OPEN',
      rosters: {
        create: roster.map((attendeeId) => ({ attendeeId })),
      },
    },
  });
}

/**
 * Seed an event with a geofence. v1.1 added Event.locationLat/lng/geofenceRadiusM;
 * scans within the radius are not flagged, scans outside are flagged but accepted.
 */
async function seedEventWithGeofence(
  orgId: string,
  userId: string,
  startsAt: Date,
  endsAt: Date,
  roster: string[],
  opts: { lat: number; lng: number; radiusM: number },
) {
  return prisma.event.create({
    data: {
      organizationId: orgId,
      createdById: userId,
      name: 'Geofence test event',
      startsAt,
      endsAt,
      status: 'OPEN',
      locationLat: opts.lat,
      locationLng: opts.lng,
      geofenceRadiusM: opts.radiusM,
      rosters: { create: roster.map((attendeeId) => ({ attendeeId })) },
    },
  });
}

describe('EAS critical paths (brief §9 step 7)', () => {
  beforeEach(async () => { await cleanDb(); });

  // ─────────────────────────────────────────────────────────────────
  // 1. QR signing/verification roundtrip
  // ─────────────────────────────────────────────────────────────────
  it('QR sign/verify roundtrip', async () => {
    const { org } = await seedOrgAndAdmin();
    const attendee = await seedAttendee(org.id, '2024-00001', 'Maria Santos', 'maria@llcc.eas.arrowtest.site');
    const event = await seedEvent(org.id, (await prisma.user.findFirst({ where: { organizationId: org.id } }))!.id,
      new Date('2026-08-01T09:00:00Z'), new Date('2026-08-01T17:00:00Z'), [attendee.id]);

    const tokenRes = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/attendees/${attendee.id}/token`)
      .set('Authorization', `Bearer ${await loginAdmin()}`);
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.token).toBeTruthy();
    const jwt = tokenRes.body.token;

    // Decode payload (no signature check — server will do that)
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString());
    expect(payload.aid).toBe(attendee.id);
    expect(payload.eid).toBe(event.id);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. Idempotency: same key twice → 1 row, 2nd = already_checked_in
  // ─────────────────────────────────────────────────────────────────
  it('idempotency: same key twice → 1 DB row, 2nd = already_checked_in', async () => {
    const { org } = await seedOrgAndAdmin();
    const userId = (await prisma.user.findFirst({ where: { organizationId: org.id } }))!.id;
    const a = await seedAttendee(org.id, 'A1', 'Alice', 'alice@llcc.eas.arrowtest.site');
    const event = await seedEvent(org.id, userId,
      new Date('2026-08-02T09:00:00Z'), new Date('2026-08-02T17:00:00Z'), [a.id]);
    const tokenRes = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/attendees/${a.id}/token`)
      .set('Authorization', `Bearer ${await loginAdmin()}`);
    const jwt = tokenRes.body.token;
    const key = uuidv4();

    const r1 = await request(app.getHttpServer())
      .post('/api/v1/attendance')
      .send({ eventId: event.id, jwt, scannedAt: new Date().toISOString(), scannerDeviceId: 't1', idempotencyKey: key });
    expect(r1.status).toBe(201);
    expect(r1.body.status).toBe('checked_in');

    const r2 = await request(app.getHttpServer())
      .post('/api/v1/attendance')
      .send({ eventId: event.id, jwt, scannedAt: new Date().toISOString(), scannerDeviceId: 't1', idempotencyKey: key });
    expect(r2.status).toBe(201);
    expect(r2.body.status).toBe('already_checked_in');

    const count = await prisma.attendanceRecord.count({ where: { eventId: event.id } });
    expect(count).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. Already in event: scan twice → 2nd is "already_checked_in"
  // ─────────────────────────────────────────────────────────────────
  it('already-in-event: second scan (new key) → already_checked_in', async () => {
    const { org } = await seedOrgAndAdmin();
    const userId = (await prisma.user.findFirst({ where: { organizationId: org.id } }))!.id;
    const a = await seedAttendee(org.id, 'A1', 'Alice', 'alice@llcc.eas.arrowtest.site');
    const event = await seedEvent(org.id, userId,
      new Date('2026-08-03T09:00:00Z'), new Date('2026-08-03T17:00:00Z'), [a.id]);
    const tokenRes = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/attendees/${a.id}/token`)
      .set('Authorization', `Bearer ${await loginAdmin()}`);
    const jwt = tokenRes.body.token;

    const r1 = await request(app.getHttpServer())
      .post('/api/v1/attendance')
      .send({ eventId: event.id, jwt, scannedAt: new Date().toISOString(), scannerDeviceId: 't1', idempotencyKey: uuidv4() });
    expect(r1.body.status).toBe('checked_in');

    const r2 = await request(app.getHttpServer())
      .post('/api/v1/attendance')
      .send({ eventId: event.id, jwt, scannedAt: new Date().toISOString(), scannerDeviceId: 't1', idempotencyKey: uuidv4() });
    expect(r2.body.status).toBe('already_checked_in');
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. Not in event roster: scan → "not_in_roster"
  // ─────────────────────────────────────────────────────────────────
  it('not-in-roster: scan attendee not on event → not_in_roster', async () => {
    const { org } = await seedOrgAndAdmin();
    const userId = (await prisma.user.findFirst({ where: { organizationId: org.id } }))!.id;
    const a1 = await seedAttendee(org.id, 'A1', 'Alice', 'alice@llcc.eas.arrowtest.site');
    const a2 = await seedAttendee(org.id, 'A2', 'Bob', 'bob@llcc.eas.arrowtest.site'); // not on the event roster
    const event = await seedEvent(org.id, userId,
      new Date('2026-08-04T09:00:00Z'), new Date('2026-08-04T17:00:00Z'), [a1.id]);
    const tokenRes = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/attendees/${a2.id}/token`)
      .set('Authorization', `Bearer ${await loginAdmin()}`);
    const jwt = tokenRes.body.token;

    const r = await request(app.getHttpServer())
      .post('/api/v1/attendance')
      .send({ eventId: event.id, jwt, scannedAt: new Date().toISOString(), scannerDeviceId: 't1', idempotencyKey: uuidv4() });
    expect(r.body.status).toBe('not_in_roster');
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. Expired/tampered JWT: scan → "invalid_token"
  // ─────────────────────────────────────────────────────────────────
  it('invalid_token: bogus JWT → invalid_token', async () => {
    const { org } = await seedOrgAndAdmin();
    const userId = (await prisma.user.findFirst({ where: { organizationId: org.id } }))!.id;
    const a = await seedAttendee(org.id, 'A1', 'Alice', 'alice@llcc.eas.arrowtest.site');
    const event = await seedEvent(org.id, userId,
      new Date('2026-08-05T09:00:00Z'), new Date('2026-08-05T17:00:00Z'), [a.id]);

    const r = await request(app.getHttpServer())
      .post('/api/v1/attendance')
      .send({
        eventId: event.id, jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJhaWQiOiJ4In0.bad',
        scannedAt: new Date().toISOString(), scannerDeviceId: 't1', idempotencyKey: uuidv4(),
      });
    expect(r.body.status).toBe('invalid_token');
  });

  // ─────────────────────────────────────────────────────────────────
  // 6. CSV import: malformed row → reported in `errors`, no crash
  // ─────────────────────────────────────────────────────────────────
  it('CSV import: malformed rows reported in errors, no crash', async () => {
    const { org } = await seedOrgAndAdmin();
    const token = await loginAdmin();
    const csv = 'identifier,fullName,email\nA1,Alice,alice@test.com\n,NoId,foo@test.com\nA3,Charlie,\nA1,DupOfAlice,\n';
    const res = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${org.id}/attendees/import`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), 'attendees.csv');
    expect(res.status).toBe(201);
    expect(res.body.created).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.errors)).toBe(true);
    // The empty-identifier row + duplicate + unique-constraint failure should appear in errors
    const hasError = res.body.errors.some((e: { row?: number; message?: string; reason?: string }) =>
      typeof e === 'object' && (typeof e.message === 'string' || typeof e.reason === 'string'));
    expect(hasError).toBe(true);
  });

  // ── v1.1: geofence (flag, don't reject) ────────────────────────────
  it('geofence: scan from outside the radius → checked_in + outsideGeofence=true + distanceM set', async () => {
    const { org } = await seedOrgAndAdmin();
    const userId = (await prisma.user.findFirst({ where: { organizationId: org.id } }))!.id;
    const a = await seedAttendee(org.id, 'A1', 'Alice', 'alice@llcc.eas.arrowtest.site');
    // Geofence at Lapu-Lapu City College (10.3103, 123.8914), 50m radius
    const event = await seedEventWithGeofence(
      org.id, userId,
      new Date('2026-08-30T09:00:00Z'), new Date('2026-08-30T17:00:00Z'),
      [a.id],
      { lat: 10.3103, lng: 123.8914, radiusM: 50 },
    );
    // Get a fresh QR token for Alice
    const tokenRes = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/attendees/${a.id}/token`)
      .set('Authorization', `Bearer ${await loginAdmin()}`);
    expect(tokenRes.status).toBe(200);
    const jwt = tokenRes.body.token;
    // Scan from Manila (~570km away, well outside the 50m radius)
    const far = await request(app.getHttpServer())
      .post('/api/v1/attendance')
      .send({
        eventId: event.id,
        jwt,
        scannedAt: '2026-08-30T10:00:00Z',
        scannerDeviceId: 'test-geofence-far',
        idempotencyKey: uuidv4(),
        scannerLat: 14.5995,
        scannerLng: 120.9842,
      });
    // The scan must be ACCEPTED (not rejected) but flagged.
    expect(far.status).toBe(201);
    expect(far.body.status).toBe('checked_in');
    // Verify the DB row carries the geofence flag
    const rec = await prisma.attendanceRecord.findFirst({
      where: { eventId: event.id, attendeeId: a.id },
    });
    expect(rec).not.toBeNull();
    expect(rec!.outsideGeofence).toBe(true);
    expect(rec!.geofenceSkipped).toBe(false);
    expect(rec!.distanceM).not.toBeNull();
    // Distance from Lapu-Lapu to Manila is ~570km. Sanity-check the magnitude.
    const distM = Number(rec!.distanceM);
    expect(distM).toBeGreaterThan(100_000);
    expect(distM).toBeLessThan(700_000);
  });

  // ── v1.1: no self check-in for attendees ───────────────────────────
  it('attendee_cannot_self_checkin: POST /me/events/:id/checkin is 404 (no such endpoint)', async () => {
    const { org } = await seedOrgAndAdmin();
    const userId = (await prisma.user.findFirst({ where: { organizationId: org.id } }))!.id;
    const a = await seedAttendee(org.id, 'A1', 'Alice', 'alice@llcc.eas.arrowtest.site');
    // Create a User + link to the Attendee so the attendee can log in
    const bcrypt = await import('bcryptjs');
    const attendeeUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'alice2@llcc.eas.arrowtest.site',
        passwordHash: await bcrypt.hash('P@$$w0rd', 10),
        name: 'Alice',
        role: 'attendee',
      },
    });
    await prisma.attendee.update({ where: { id: a.id }, data: { userId: attendeeUser.id } });
    const event = await seedEvent(org.id, userId,
      new Date('2026-08-30T09:00:00Z'), new Date('2026-08-30T17:00:00Z'), [a.id]);
    // Log in as the attendee
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'alice2@llcc.eas.arrowtest.site', password: 'P@$$w0rd' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('attendee');
    const attendeeToken = login.body.token;
    // Try to self check-in via every plausible URL — all should 404
    for (const path of [
      `/api/v1/me/events/${event.id}/checkin`,
      `/api/v1/me/events/${event.id}/attendance`,
      `/api/v1/me/attendance`,
    ]) {
      const r = await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({});
      // We only care that POST to /me/events/:id/checkin is 404. The other two
      // are valid GETs but POST is a method-not-allowed on them.
      if (path.includes('/checkin')) {
        expect(r.status).toBe(404);
        expect(JSON.stringify(r.body)).toMatch(/not found|cannot post/i);
      }
    }
  });

  // ── v1.1.1: Setup-link flow ────────────────────────────────────────
  it('setup_account_flow: magic link, one-time use, password set', async () => {
    const { org } = await seedOrgAndAdmin();
    const adminToken = await loginAdmin();
    const attendee = await seedAttendee(
      org.id,
      'SETUP-001',
      'Setup Tester',
      'setup-tester@llcc.eas.arrowtest.site',
    );

    const mailSvc = app.get(MailService);
    const sendSpy = vi.spyOn(mailSvc, 'trySendSetupEmail').mockImplementation(async () => ({ ok: true }));

    // 1. POST create-account → must return setupUrl (NOT tempPassword)
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${org.id}/attendees/${attendee.id}/create-account`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'setup-tester@llcc.eas.arrowtest.site' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.setupUrl).toMatch(/\/setup-account\?token=/);
    expect(createRes.body.tempPassword).toBeUndefined();

    // Verify email was sent
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      'setup-tester@llcc.eas.arrowtest.site',
      'Setup Tester',
      createRes.body.setupUrl,
      expect.any(Number),
    );
    sendSpy.mockRestore();

    // 2. Extract the JWT from the setupUrl
    const setupUrl: string = createRes.body.setupUrl;
    const tokenMatch = setupUrl.match(/[?&]token=([^&]+)/);
    expect(tokenMatch).not.toBeNull();
    const setupToken = decodeURIComponent(tokenMatch![1]!);

    // 3. POST /auth/setup-account with the token + new password → 201
    const newPassword = 'MyNewP@ss123';
    const setupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/setup-account')
      .send({ token: setupToken, newPassword });
    expect(setupRes.status).toBe(201);
    expect(setupRes.body.email).toBe('setup-tester@llcc.eas.arrowtest.site');

    // 4. Second POST with the same token → 410 Gone
    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/auth/setup-account')
      .send({ token: setupToken, newPassword: 'AnotherPass1' });
    expect(replayRes.status).toBe(410);

    // 5. Login with email + newPassword → 200 + JWT
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'setup-tester@llcc.eas.arrowtest.site', password: newPassword });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();
    expect(loginRes.body.user.role).toBe('attendee');
  });

  // ── v1.1.1: Bulk create-accounts ──────────────────────────────────
  it('bulk_create_accounts: partial success, summary correct', async () => {
    const { org } = await seedOrgAndAdmin();
    const adminToken = await loginAdmin();
    const bcryptMod = await import('bcryptjs');

    // 1. Create 5 attendees:
    //    - 3 with email and no account (should be created)
    //    - 1 with email but already has account (should be skipped: already_has_account)
    //    - 1 with null email → but Attendee.email is required in schema, so use empty string check workaround
    //      The schema requires email, so we create with a placeholder and patch to simulate missing_email.
    //      Actually: the skipped reason 'missing_email' applies when Attendee.email is falsy. Since the
    //      schema enforces email, we'll rely on the service checking `!attendee.email`.
    //      For the test: create attendee normally but manually set email to empty string in DB.

    const a1 = await seedAttendee(org.id, 'BULK-001', 'Alice Bulk', 'bulk-alice@llcc.eas.arrowtest.site');
    const a2 = await seedAttendee(org.id, 'BULK-002', 'Bob Bulk', 'bulk-bob@llcc.eas.arrowtest.site');
    const a3 = await seedAttendee(org.id, 'BULK-003', 'Carol Bulk', 'bulk-carol@llcc.eas.arrowtest.site');

    // Attendee with existing account
    const a4 = await seedAttendee(org.id, 'BULK-004', 'Dave Bulk', 'bulk-dave@llcc.eas.arrowtest.site');
    const a4User = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'bulk-dave@llcc.eas.arrowtest.site',
        passwordHash: await bcryptMod.hash('P@$$w0rd', 10),
        name: 'Dave Bulk',
        role: 'attendee',
      },
    });
    await prisma.attendee.update({ where: { id: a4.id }, data: { userId: a4User.id } });

    // Attendee with empty email (simulate missing_email)
    const a5 = await prisma.attendee.create({
      data: { organizationId: org.id, identifier: 'BULK-005', fullName: 'Eve Bulk', email: '' },
    });

    const attendeeIds = [a1.id, a2.id, a3.id, a4.id, a5.id];

    const mailSvc = app.get(MailService);
    const sendSpy = vi.spyOn(mailSvc, 'trySendSetupEmail').mockImplementation(async () => ({ ok: true }));

    // 2. POST bulk-create-accounts
    const bulkRes = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${org.id}/attendees/bulk-create-accounts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attendeeIds });
    expect(bulkRes.status).toBe(200);

    // Verify email was sent for the 3 successfully created users
    expect(sendSpy).toHaveBeenCalledTimes(3);
    sendSpy.mockRestore();

    const { created, skipped, summary } = bulkRes.body as {
      created: Array<{ attendeeId: string; email: string; setupUrl: string; emailSent: boolean }>;
      skipped: Array<{ attendeeId: string; reason: string }>;
      summary: { requested: number; created: number; skipped: number; emailFailures: number };
    };

    // 3. Assert counts
    expect(created.length).toBe(3);
    expect(skipped.length).toBe(2);
    expect(summary.requested).toBe(5);
    expect(summary.created).toBe(3);
    expect(summary.skipped).toBe(2);

    // 4. Assert skipped reasons
    const skippedReasons = skipped.map((s) => s.reason);
    expect(skippedReasons).toContain('already_has_account');
    expect(skippedReasons).toContain('missing_email');

    // 5. Assert each created entry has a valid-looking setupUrl JWT
    for (const entry of created) {
      expect(entry.setupUrl).toMatch(/\/setup-account\?token=/);
      const tokenMatch = entry.setupUrl.match(/[?&]token=([^&]+)/);
      expect(tokenMatch).not.toBeNull();
      const tokenParts = decodeURIComponent(tokenMatch![1]!).split('.');
      expect(tokenParts.length).toBe(3); // JWT has 3 parts
      const payload = JSON.parse(Buffer.from(tokenParts[1]!, 'base64url').toString());
      expect(payload.purpose).toBe('setup');
      expect(payload.sub).toBeTruthy();
    }
  });

  // ── v1.1.1: Tenant registration ────────────────────────────────────
  it('tenant_registration: successfully registers a new organization and admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        orgName: 'Mactan University',
        orgSlug: 'mactan-uni',
        orgType: 'SCHOOL',
        adminName: 'Mactan Admin',
        adminEmail: 'admin@mactan.edu',
        adminPassword: 'securePassword123',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.organization.name).toBe('Mactan University');
    expect(res.body.data.organization.slug).toBe('mactan-uni');
    expect(res.body.data.organization.type).toBe('SCHOOL');
    expect(res.body.data.admin.name).toBe('Mactan Admin');
    expect(res.body.data.admin.email).toBe('admin@mactan.edu');
    expect(res.body.data.admin.role).toBe('admin');

    // Verify in database
    const org = await prisma.organization.findUnique({ where: { slug: 'mactan-uni' } });
    expect(org).toBeTruthy();
    expect(org!.name).toBe('Mactan University');

    const user = await prisma.user.findFirst({ where: { email: 'admin@mactan.edu' } });
    expect(user).toBeTruthy();
    expect(user!.name).toBe('Mactan Admin');
    expect(user!.organizationId).toBe(org!.id);
  });

  it('tenant_registration: rejects duplicate organization slug', async () => {
    // 1. Create first tenant
    await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        orgName: 'Mactan University',
        orgSlug: 'mactan-uni',
        orgType: 'SCHOOL',
        adminName: 'Mactan Admin',
        adminEmail: 'admin@mactan.edu',
        adminPassword: 'securePassword123',
      });

    // 2. Attempt duplicate slug registration
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        orgName: 'Mactan College',
        orgSlug: 'mactan-uni', // Duplicate slug
        orgType: 'SCHOOL',
        adminName: 'Mactan Admin 2',
        adminEmail: 'admin2@mactan.edu',
        adminPassword: 'securePassword123',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Organization slug is already in use');
  });

  it('tenant_registration: rejects duplicate admin email', async () => {
    // 1. Create first tenant
    await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        orgName: 'Mactan University',
        orgSlug: 'mactan-uni',
        orgType: 'SCHOOL',
        adminName: 'Mactan Admin',
        adminEmail: 'admin@mactan.edu',
        adminPassword: 'securePassword123',
      });

    // 2. Attempt duplicate email registration
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        orgName: 'Mactan College',
        orgSlug: 'mactan-col',
        orgType: 'SCHOOL',
        adminName: 'Mactan Admin 2',
        adminEmail: 'admin@mactan.edu', // Duplicate email
        adminPassword: 'securePassword123',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Email address is already in use');
  });

  it('tenant_registration: rejects invalid inputs based on class-validator', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        orgName: '', // Empty
        orgSlug: 'invalid slug format', // spaces
        orgType: 'INVALID_TYPE',
        adminName: '',
        adminEmail: 'not-an-email',
        adminPassword: 'short', // < 8 chars
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });
});

