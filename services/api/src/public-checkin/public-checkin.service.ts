import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import { AttendanceService } from '../attendance/attendance.service';
import { randomUUID } from 'node:crypto';

@Injectable()
export class PublicCheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qr: QrService,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * The "graceful degradation" path. The QR encodes a URL like
   * https://host/check-in/<eventId>?t=<jwt>. The user opens it on their phone
   * and taps "Confirm check-in". This service:
   *   1. Verifies the JWT
   *   2. Looks up the attendee
   *   3. Returns a "ready to confirm" view
   *   4. On confirm, records the scan via the same path the scanner uses
   */
  async preview(eventId: string, jwtToken: string) {
    const payload = await this.qr.verifyAttendeeQr(jwtToken);
    if (payload.eid !== eventId) {
      throw new BadRequestException('Token does not match this event');
    }
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });
    if (!event) throw new NotFoundException('Event not found');
    const attendee = await this.prisma.attendee.findUnique({ where: { id: payload.aid } });
    if (!attendee || attendee.organizationId !== event.organizationId) {
      throw new NotFoundException('Attendee not on this event');
    }
    const onRoster = await this.prisma.eventRoster.findUnique({
      where: { eventId_attendeeId: { eventId, attendeeId: attendee.id } },
    });
    const alreadyCheckedIn = await this.prisma.attendanceRecord.findFirst({
      where: { eventId, attendeeId: attendee.id },
    });
    return {
      event: { id: event.id, name: event.name, startsAt: event.startsAt, endsAt: event.endsAt },
      attendee: { id: attendee.id, identifier: attendee.identifier, fullName: attendee.fullName },
      onRoster: !!onRoster,
      alreadyCheckedIn: !!alreadyCheckedIn,
    };
  }

  /**
   * Confirm the check-in from the public page. Same path as the scanner.
   * Adds a generic device id and a server-side `scannedAt`.
   */
  async confirm(eventId: string, jwtToken: string, deviceId: string) {
    return this.attendance.recordScan({
      eventId,
      jwt: jwtToken,
      scannedAt: new Date().toISOString(),
      scannerDeviceId: deviceId,
      idempotencyKey: randomUUID(),
    });
  }
}
