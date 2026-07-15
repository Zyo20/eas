import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsString, IsUUID, MinLength } from 'class-validator';
import { PublicCheckinService } from './public-checkin.service';

class ConfirmBody {
  @IsString() @MinLength(1) deviceId!: string;
}

@Controller('check-in')
export class PublicCheckinController {
  constructor(private readonly svc: PublicCheckinService) {}

  /**
   * GET /check-in/:eventId?t=<jwt>
   * Returns a JSON preview the public-facing page can render:
   * "Confirm check-in for [Name]?"
   */
  @Get(':eventId')
  async preview(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query('t') token: string,
  ) {
    if (!token) {
      return { error: 'missing_token', message: 'Pass ?t=<jwt> from your QR code' };
    }
    return this.svc.preview(eventId, token);
  }

  /**
   * POST /check-in/:eventId/confirm?t=<jwt>
   * Body: { deviceId: string }
   * Records the check-in via the same path the scanner uses.
   */
  @Post(':eventId/confirm')
  async confirm(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query('t') token: string,
    @Body() body: ConfirmBody,
  ) {
    if (!token) {
      return { status: 'invalid_token' as const };
    }
    return this.svc.confirm(eventId, token, body.deviceId);
  }
}
