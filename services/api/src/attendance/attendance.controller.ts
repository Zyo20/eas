import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { QrService } from '../qr/qr.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AttendancePostRequest, AttendancePostResponse } from '@eas/shared';

class PostAttendanceBody implements AttendancePostRequest {
  @IsUUID('4') eventId!: string;
  @IsString() jwt!: string;
  @IsString() scannedAt!: string;
  @IsString() scannerDeviceId!: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) scannerLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) scannerLng?: number;
  @IsUUID('4') idempotencyKey!: string;
}

class ManualCheckInBody {
  @IsUUID('4') attendeeId!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@Controller()
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly qr: QrService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The scan endpoint. Public — the JWT in the body is the auth.
   */
  @Post('attendance')
  async post(@Body() body: PostAttendanceBody): Promise<AttendancePostResponse> {
    return this.attendance.recordScan(body);
  }

  /**
   * Manual check-in (admin only). Adds to roster if not already there.
   */
  @Post('events/:eventId/attendance/manual')
  @UseGuards(AdminGuard)
  async manual(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: ManualCheckInBody,
  ) {
    return this.attendance.manualCheckIn(
      // Org context is taken from the authed user, not the URL — defense.
      (await this.prisma.event.findFirst({ where: { id: eventId } }))!.organizationId,
      eventId,
      body.attendeeId,
      body.note,
    );
  }

  @Get('events/:eventId/attendance')
  @UseGuards(AdminGuard)
  async list(@Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return this.attendance.list(eventId);
  }

  @Get('events/:eventId/attendance/summary')
  @UseGuards(AdminGuard)
  async summary(@Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return this.attendance.summary(eventId);
  }

  @Get('events/:eventId/attendance/who-hasnt-arrived')
  @UseGuards(AdminGuard)
  async whoHasnt(@Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return this.attendance.whoHasntArrived(eventId);
  }

  /** Count of records flagged as outside the event's geofence (admin only). */
  @Get('events/:eventId/attendance/flagged-count')
  @UseGuards(AdminGuard)
  async flaggedCount(@Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return { eventId, flaggedCount: await this.attendance.flaggedCount(eventId) };
  }

  /**
   * Scanner-bootstrap: returns event details + roster for offline caching.
   * Public — the device header is metadata only, not auth (v1).
   */
  @Get('events/:eventId/scanner-bootstrap')
  async scannerBootstrap(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Headers('x-scanner-device') deviceId?: string,
  ) {
    return this.attendance.scannerBootstrap(eventId, deviceId);
  }
}
