import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

export type QrPayload = {
  aid: string; // attendeeId
  eid: string; // eventId
  iat: number;
  exp: number; // event.endsAt + 24h
};

@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private getSecret(): string {
    const s = this.config.get<string>('QR_HMAC_SECRET');
    if (!s) {
      throw new Error('QR_HMAC_SECRET not set');
    }
    return s;
  }

  /**
   * Sign a personal QR token for a given attendee + event.
   * `exp` is event.endsAt + 24h.
   */
  async signAttendeeQr(attendeeId: string, eventId: string): Promise<{ jwt: string; payload: QrPayload }> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const iat = Math.floor(Date.now() / 1000);
    const exp = Math.floor(event.endsAt.getTime() / 1000) + 24 * 60 * 60;
    const payload: QrPayload = { aid: attendeeId, eid: eventId, iat, exp };
    const jwt = await this.jwt.signAsync(payload, {
      secret: this.getSecret(),
      algorithm: 'HS256',
    });
    return { jwt, payload };
  }

  async verifyAttendeeQr(jwtToken: string): Promise<QrPayload> {
    try {
      const decoded = await this.jwt.verifyAsync<QrPayload>(jwtToken, {
        secret: this.getSecret(),
        algorithms: ['HS256'],
      });
      if (!decoded.aid || !decoded.eid) {
        throw new Error('payload missing aid or eid');
      }
      return decoded;
    } catch {
      throw new BadRequestException('Invalid or expired QR token');
    }
  }

  /**
   * Build the public check-in URL for a signed JWT.
   */
  buildPublicCheckInUrl(jwt: string, eventId: string): string {
    const baseUrl = this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:4000';
    return `${baseUrl.replace(/\/+$/, '')}/check-in/${eventId}?t=${encodeURIComponent(jwt)}`;
  }

  /**
   * Generate a QR image (PNG buffer or SVG string) for a personal QR.
   * The URL embedded is `<PUBLIC_BASE_URL>/check-in/<eventId>?t=<jwt>`.
   */
  async renderQrImage(jwt: string, eventId: string, format: 'png' | 'svg'): Promise<Buffer | string> {
    const url = this.buildPublicCheckInUrl(jwt, eventId);
    if (format === 'svg') {
      return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    }
    return QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 512 });
  }

  /**
   * Generate a printable PDF roster sheet — paginated 3x4 grid, 12 QRs per page.
   */
  async renderRosterPdf(eventId: string): Promise<Buffer> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: {
        rosters: {
          include: { attendee: true },
          orderBy: { attendee: { fullName: 'asc' } },
        },
      },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);
    if (event.rosters.length === 0) {
      throw new BadRequestException('Event has no roster — add attendees first');
    }

    // Pre-sign all JWTs.
    const signed = await Promise.all(
      event.rosters.map(async (r) => ({
        attendee: r.attendee,
        jwt: (await this.signAttendeeQr(r.attendeeId, eventId)).jwt,
      })),
    );

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header.
      doc.fontSize(16).text(`Event Roster — ${event.name}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666').text(`${event.location ?? ''}  ·  ${event.startsAt.toISOString()} → ${event.endsAt.toISOString()}`, { align: 'center' });
      doc.moveDown(0.6);

      // Grid: 3 columns x 4 rows = 12 per page.
      const cellW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 3;
      const cellH = (doc.page.height - doc.page.margins.top - doc.page.margins.bottom - 60) / 4;
      const startX = doc.page.margins.left;
      const startY = doc.y;
      let i = 0;
      const drawCell = async (idx: number) => {
        if (idx >= signed.length) {
          doc.end();
          return;
        }
        const col = idx % 3;
        const row = Math.floor((idx % 12) / 3);
        if (idx > 0 && idx % 12 === 0) {
          doc.addPage();
        }
        const cellIndex = idx % 12;
        const c = cellIndex % 3;
        const r = Math.floor(cellIndex / 3);
        const x = startX + c * cellW;
        const y = startY + r * cellH;
        const item = signed[idx]!;
        // QR (PNG) — embed.
        const png = (await QRCode.toBuffer(
          `${(this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:4000').replace(/\/+$/, '')}/check-in/${eventId}?t=${encodeURIComponent(item.jwt)}`,
          { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 220 },
        )) as Buffer;
        const qrSize = Math.min(cellW, cellH) - 24;
        doc.image(png, x + (cellW - qrSize) / 2, y, { width: qrSize, height: qrSize });
        // Caption.
        doc.fontSize(8).fillColor('#000').text(
          `${item.attendee.identifier}  ·  ${item.attendee.fullName}`,
          x + 4,
          y + qrSize + 4,
          { width: cellW - 8, align: 'center', ellipsis: true },
        );
        drawCell(idx + 1);
      };
      void drawCell(0);
    });
  }
}
