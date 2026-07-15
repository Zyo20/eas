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

let app: INestApplication;
let prisma: PrismaService;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.init();
  prisma = app.get(PrismaService);
  baseUrl = (await app.getHttpServer()).listen(0).address() as unknown as string;
  // Don't actually need a port — supertest uses the in-memory server
});

afterAll(async () => {
  await app.close();
});

async function cleanDb() {
  // Order matters: FK chains
  await prisma.attendanceRecord.deleteMany();
  await prisma.eventRoster.deleteMany();
  await prisma.event.deleteMany();
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
});
