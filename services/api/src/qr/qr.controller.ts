import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
  Header,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QrService } from './qr.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AttendeeGuard } from '../auth/attendee.guard';
import { PrismaService } from '../prisma/prisma.service';

interface AuthedRequest extends Request {
  user: { sub: string; email: string; organizationId: string; role: string };
}

@Controller()
export class QrController {
  constructor(
    private readonly qr: QrService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Per-attendee QR image (svg or png). Mounted under /api/v1/events/:eventId/attendees/:attendeeId.
   * Auth required: must be admin of the same org as the event.
   */
  @Get('events/:eventId/attendees/:attendeeId/qr.:format(svg|png)')
  @UseGuards(AdminGuard)
  async attendeeQr(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('attendeeId', new ParseUUIDPipe()) attendeeId: string,
    @Param('format') format: 'svg' | 'png',
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!event) {
      res.status(404).json({ message: 'Event not found' });
      return;
    }
    if (event.organizationId !== req.user.organizationId) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    const { jwt } = await this.qr.signAttendeeQr(attendeeId, eventId);
    const data = await this.qr.renderQrImage(jwt, eventId, format);
    if (format === 'svg') {
      res
        .status(200)
        .set({ 'content-type': 'image/svg+xml', 'cache-control': 'private, max-age=300' })
        .send(String(data));
    } else {
      res
        .status(200)
        .set({ 'content-type': 'image/png', 'cache-control': 'private, max-age=300' })
        .send(Buffer.from(data as Buffer));
    }
  }

  /**
   * Roster PDF — paginated 12/page. Auth required.
   */
  @Get('orgs/:orgId/events/:eventId/roster-qr-sheet.pdf')
  @UseGuards(AdminGuard)
  async rosterPdf(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    if (orgId !== req.user.organizationId) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    const pdf = await this.qr.renderRosterPdf(eventId);
    res
      .status(200)
      .set({
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="event-${eventId}-qr-sheet.pdf"`,
        'content-length': String(pdf.length),
      })
      .send(pdf);
  }

  /**
   * Admin helper: return the raw signed JWT + the public check-in URL.
   * Used by admin tooling, the demo, and the scanner bootstrap. Auth required.
   * (In v1 the QR image embeds the URL; this endpoint exposes it as text.)
   */
  @Get('events/:eventId/attendees/:attendeeId/token')
  @UseGuards(AdminGuard)
  async token(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('attendeeId', new ParseUUIDPipe()) attendeeId: string,
  ) {
    const { jwt, payload } = await this.qr.signAttendeeQr(attendeeId, eventId);
    const url = this.qr.buildPublicCheckInUrl(jwt, eventId);
    return { token: jwt, url, payload };
  }
}
