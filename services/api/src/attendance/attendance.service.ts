import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AttendanceSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import type { AttendancePostResponse, AttendanceStatus } from '@eas/shared';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qr: QrService,
  ) {}

  /**
   * The scan endpoint. Per §4:
   *  - No auth header. The signed JWT in the body IS the auth.
   *  - Returns one of 5 status values: checked_in | already_checked_in | not_in_roster | invalid_token | event_closed
   */
  async recordScan(body: {
    eventId: string;
    jwt: string;
    scannedAt: string;
    scannerDeviceId: string;
    scannerLat?: number | null;
    scannerLng?: number | null;
    idempotencyKey: string;
  }): Promise<AttendancePostResponse> {
    // 1. Verify JWT signature + payload shape.
    let payload;
    try {
      payload = await this.qr.verifyAttendeeQr(body.jwt);
    } catch {
      return { status: 'invalid_token' as AttendanceStatus };
    }
    if (payload.eid !== body.eventId) {
      return { status: 'invalid_token' as AttendanceStatus };
    }

    // 2. Event must exist, not soft-deleted, and not closed.
    const event = await this.prisma.event.findFirst({
      where: { id: body.eventId, deletedAt: null },
    });
    if (!event) return { status: 'invalid_token' as AttendanceStatus };
    if (event.status === 'CLOSED') {
      return { status: 'event_closed' as AttendanceStatus };
    }

    // 3. Attendee must exist.
    const attendee = await this.prisma.attendee.findUnique({ where: { id: payload.aid } });
    if (!attendee || attendee.organizationId !== event.organizationId) {
      return { status: 'not_in_roster' as AttendanceStatus };
    }

    // 4. Attendee must be on the event roster.
    const onRoster = await this.prisma.eventRoster.findUnique({
      where: { eventId_attendeeId: { eventId: event.id, attendeeId: attendee.id } },
    });
    if (!onRoster) {
      return { status: 'not_in_roster' as AttendanceStatus };
    }

    // 5. Geofence check (flag-only, never reject per spec).
    //    If the event has a geofence and the scanner sent coords, compute the
    //    haversine distance and flag the record (not the response).
    let outsideGeofence = false;
    let geofenceSkipped = false;
    let distanceM: number | null = null;
    const hasScannerCoords =
      body.scannerLat !== undefined && body.scannerLat !== null &&
      body.scannerLng !== undefined && body.scannerLng !== null;
    const hasEventGeofence = event.locationLat !== null && event.locationLng !== null;
    if (!hasScannerCoords) {
      // Scanner denied/unsupported geolocation. Flag and continue.
      geofenceSkipped = true;
    } else if (hasEventGeofence) {
      distanceM = haversineMeters(
        event.locationLat!.toNumber(),
        event.locationLng!.toNumber(),
        body.scannerLat!,
        body.scannerLng!,
      );
      if (distanceM > event.geofenceRadiusM) {
        outsideGeofence = true;
      }
    }
    // else: scanner sent coords, event has no geofence → record without flag.

    // 6. Insert AttendanceRecord. Two unique constraints work together:
    //    - (eventId, idempotencyKey): scanner-side dedup of replays
    //    - (eventId, attendeeId): server-side dedup of double-scans
    try {
      const record = await this.prisma.attendanceRecord.create({
        data: {
          eventId: event.id,
          attendeeId: attendee.id,
          idempotencyKey: body.idempotencyKey,
          scannedAt: new Date(body.scannedAt),
          source: AttendanceSource.SCAN,
          scannerDeviceId: body.scannerDeviceId,
          scannerLat: body.scannerLat ?? null,
          scannerLng: body.scannerLng ?? null,
          outsideGeofence,
          geofenceSkipped,
          distanceM,
        },
      });
      return {
        status: 'checked_in' as AttendanceStatus,
        recordId: record.id,
        attendee: { id: attendee.id, fullName: attendee.fullName, identifier: attendee.identifier },
      };
    } catch (err) {
      // P2002 = unique constraint violation. Two cases:
      //   - same idempotency key (replay)  → "already_checked_in"
      //   - same (eventId, attendeeId)     → also "already_checked_in"
      const e = err as Prisma.PrismaClientKnownRequestError;
      if (e.code === 'P2002') {
        return {
          status: 'already_checked_in' as AttendanceStatus,
          attendee: { id: attendee.id, fullName: attendee.fullName, identifier: attendee.identifier },
        };
      }
      throw err;
    }
  }

  /**
   * Manual check-in. Admin calls this for late arrivals / off-roster guests.
   * Adds to roster if not already there.
   */
  async manualCheckIn(
    orgId: string,
    eventId: string,
    attendeeId: string,
    note?: string | null,
  ): Promise<{ status: 'checked_in'; recordId: string; attendee: { id: string; fullName: string; identifier: string } }> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId, deletedAt: null },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);
    const attendee = await this.prisma.attendee.findFirst({
      where: { id: attendeeId, organizationId: orgId },
    });
    if (!attendee) throw new NotFoundException(`Attendee ${attendeeId} not found`);

    // Auto-add to roster for off-roster manual check-ins.
    await this.prisma.eventRoster.upsert({
      where: { eventId_attendeeId: { eventId, attendeeId } },
      create: { eventId, attendeeId },
      update: {},
    });

    try {
      const record = await this.prisma.attendanceRecord.create({
        data: {
          eventId,
          attendeeId,
          idempotencyKey: randomUUID(),
          scannedAt: new Date(),
          source: AttendanceSource.MANUAL,
          note: note ?? null,
        },
      });
      return {
        status: 'checked_in' as const,
        recordId: record.id,
        attendee: { id: attendee.id, fullName: attendee.fullName, identifier: attendee.identifier },
      };
    } catch (err) {
      const e = err as Prisma.PrismaClientKnownRequestError;
      if (e.code === 'P2002') {
        // Already checked in. Return the existing record (fetch by attendee).
        const existing = await this.prisma.attendanceRecord.findFirst({
          where: { eventId, attendeeId },
        });
        return {
          status: 'checked_in' as const,
          recordId: existing?.id ?? '',
          attendee: { id: attendee.id, fullName: attendee.fullName, identifier: attendee.identifier },
        };
      }
      throw err;
    }
  }

  /**
   * List attendance records for an event (admin view).
   * Includes geofence flag data so the dashboard can show "outside geofence" warnings.
   */
  async list(eventId: string) {
    return this.prisma.attendanceRecord.findMany({
      where: { eventId },
      include: { attendee: { select: { id: true, identifier: true, fullName: true } } },
      orderBy: { scannedAt: 'desc' },
    });
  }

  /** Count of records flagged as outside the event's geofence. */
  async flaggedCount(eventId: string): Promise<number> {
    return this.prisma.attendanceRecord.count({
      where: { eventId, outsideGeofence: true },
    });
  }

  async summary(eventId: string) {
    const total = await this.prisma.eventRoster.count({ where: { eventId } });
    const checkedIn = await this.prisma.attendanceRecord.count({ where: { eventId } });
    const remaining = Math.max(0, total - checkedIn);
    const percent = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
    return { total, checkedIn, remaining, percent };
  }

  async whoHasntArrived(eventId: string) {
    return this.prisma.$queryRaw<
      Array<{ id: string; identifier: string; fullName: string }>
    >`
      SELECT a.id, a.identifier, a."fullName"
      FROM "Attendee" a
      JOIN "EventRoster" er ON er."attendeeId" = a.id
      WHERE er."eventId" = ${eventId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM "AttendanceRecord" ar
          WHERE ar."eventId" = ${eventId}::uuid AND ar."attendeeId" = a.id
        )
      ORDER BY a."fullName" ASC
    `;
  }

  /**
   * Scanner-bootstrap. Public endpoint that returns the event details and the
   * roster the PWA caches in IndexedDB for offline use.
   * v1: no auth on this endpoint — anyone with the eventId can fetch the
   * roster. The QR signed JWT is still required to actually record a scan.
   * v1.1: add event-scoped scanner PIN.
   */
  async scannerBootstrap(eventId: string, _deviceId?: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const roster = await this.prisma.$queryRaw<
      Array<{ id: string; identifier: string; fullName: string; photoUrl: string | null }>
    >`
      SELECT a.id, a.identifier, a."fullName", a."photoUrl"
      FROM "Attendee" a
      JOIN "EventRoster" er ON er."attendeeId" = a.id
      WHERE er."eventId" = ${eventId}::uuid
      ORDER BY a."fullName" ASC
    `;
    return {
      event: {
        id: event.id,
        name: event.name,
        location: event.location,
        status: event.status,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        locationLat: event.locationLat ? event.locationLat.toNumber() : null,
        locationLng: event.locationLng ? event.locationLng.toNumber() : null,
        geofenceRadiusM: event.geofenceRadiusM,
      },
      roster: roster.map((r) => ({
        id: r.id,
        identifier: r.identifier,
        fullName: r.fullName,
        photoUrl: r.photoUrl ?? undefined,
      })),
    };
  }
}

/**
 * Haversine distance in meters between two (lat, lng) pairs.
 * Earth's mean radius = 6371000m. Accuracy: ±0.5% for typical use.
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
