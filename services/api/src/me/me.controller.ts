import { Controller, Get, Param, ParseUUIDPipe, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AttendeeGuard } from '../auth/attendee.guard';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';

interface AttendeeAuthedRequest extends Request {
  user: { sub: string; email: string; organizationId: string; role: string };
}

/**
 * Attendee self-service endpoints.
 * Auth: AttendeeGuard (role === 'attendee'). The User row's id matches Attendee.userId.
 *
 * Endpoints:
 *   GET /me                         — own attendee profile
 *   GET /me/events                  — events on the attendee's roster
 *   GET /me/events/:id/qr.svg|png   — own personal QR for an event
 *   GET /me/attendance              — own attendance history (with geofence flags)
 */
@Controller('me')
@UseGuards(AttendeeGuard)
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qr: QrService,
  ) {}

  @Get()
  async me(@Req() req: AttendeeAuthedRequest) {
    const attendee = await this.prisma.attendee.findUnique({
      where: { userId: req.user.sub },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!attendee) {
      // Authenticated attendee user with no linked Attendee row. Should never happen
      // if create-account flow ran, but treat as 404 to surface the bug.
      return null;
    }
    return {
      id: attendee.id,
      identifier: attendee.identifier,
      fullName: attendee.fullName,
      email: attendee.email,
      organization: attendee.organization,
    };
  }

  @Get('events')
  async myEvents(@Req() req: AttendeeAuthedRequest) {
    const attendee = await this.prisma.attendee.findUnique({
      where: { userId: req.user.sub },
      include: {
        rosters: {
          include: {
            event: {
              select: {
                id: true,
                name: true,
                location: true,
                startsAt: true,
                endsAt: true,
                status: true,
              },
            },
          },
          orderBy: { event: { startsAt: 'desc' } },
        },
      },
    });
    if (!attendee) return { data: [] };
    const data = attendee.rosters.map((r) => ({
      ...r.event,
      startsAt: r.event.startsAt.toISOString(),
      endsAt: r.event.endsAt.toISOString(),
    }));
    return { data };
  }

  @Get('events/:eventId/attendance')
  async myAttendanceForEvent(
    @Req() req: AttendeeAuthedRequest,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ) {
    const attendee = await this.prisma.attendee.findUnique({ where: { userId: req.user.sub } });
    if (!attendee) return null;
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { eventId, attendeeId: attendee.id },
    });
    if (!record) return { status: 'not_yet_checked_in' };
    return {
      status: 'checked_in',
      recordId: record.id,
      scannedAt: record.scannedAt.toISOString(),
      source: record.source,
      // Geofence audit: surfaced to the attendee so they can see "your check-in was N meters from the venue"
      outsideGeofence: record.outsideGeofence,
      distanceM: record.distanceM ? Number(record.distanceM.toString()) : null,
      geofenceSkipped: record.geofenceSkipped,
    };
  }

  @Get('attendance')
  async myAttendance(@Req() req: AttendeeAuthedRequest) {
    const attendee = await this.prisma.attendee.findUnique({
      where: { userId: req.user.sub },
      include: {
        records: {
          include: {
            event: { select: { id: true, name: true, startsAt: true, endsAt: true } },
          },
          orderBy: { scannedAt: 'desc' },
        },
      },
    });
    if (!attendee) return { data: [] };
    return {
      data: attendee.records.map((r) => ({
        recordId: r.id,
        event: {
          ...r.event,
          startsAt: r.event.startsAt.toISOString(),
          endsAt: r.event.endsAt.toISOString(),
        },
        scannedAt: r.scannedAt.toISOString(),
        source: r.source,
        outsideGeofence: r.outsideGeofence,
        distanceM: r.distanceM ? Number(r.distanceM.toString()) : null,
        geofenceSkipped: r.geofenceSkipped,
      })),
    };
  }

  /**
   * Own personal QR for an event. v1: no auth on the underlying route since
   * AttendeeGuard already proves the user is the attendee. The QR is signed
   * with QR_HMAC_SECRET, so the scanner can verify even if the URL leaks.
   */
  @Get('events/:eventId/qr.:format(svg|png)')
  async myQr(
    @Req() req: AttendeeAuthedRequest,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('format') format: 'svg' | 'png',
    @Res() res: Response,
  ) {
    const attendee = await this.prisma.attendee.findUnique({ where: { userId: req.user.sub } });
    if (!attendee) {
      res.status(404).json({ message: 'Attendee profile not found' });
      return;
    }
    // Must be on the roster for this event
    const onRoster = await this.prisma.eventRoster.findUnique({
      where: { eventId_attendeeId: { eventId, attendeeId: attendee.id } },
    });
    if (!onRoster) {
      res.status(404).json({ message: 'You are not on the roster for this event' });
      return;
    }
    const { jwt } = await this.qr.signAttendeeQr(attendee.id, eventId);
    const url = this.qr.buildPublicCheckInUrl(jwt, eventId);
    const data = await this.qr.renderQrImage(jwt, eventId, format);
    // Return JSON envelope with the signed token + rendered image (base64).
    // The frontend can display the image and the public-checkin URL in one call.
    res.status(200).json({
      token: jwt,
      url,
      format,
      image: Buffer.from(data).toString('base64'),
      imageMime: format === 'svg' ? 'image/svg+xml' : 'image/png',
    });
  }
}
