import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, MinLength, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { CreateEventRequest, UpdateEventRequest } from '@eas/shared';
import { EventsService, EventDto } from './events.service';
import { AdminGuard } from '../auth/admin.guard';

class CreateEventBody {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsString() startsAt!: string;
  @IsString() endsAt!: string;
  @IsArray() @IsUUID('4', { each: true }) attendeeIds!: string[];
  @IsOptional() @IsNumber() @Min(-90) @Max(90) locationLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) locationLng?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000) geofenceRadiusM?: number;
}

class UpdateEventBody {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsIn(['DRAFT', 'OPEN', 'CLOSED']) status?: 'DRAFT' | 'OPEN' | 'CLOSED';
  @IsOptional() @IsNumber() @Min(-90) @Max(90) locationLat?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) locationLng?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10000) geofenceRadiusM?: number;
}

class SetRosterBody {
  @IsArray() @IsUUID('4', { each: true }) attendeeIds!: string[];
}

interface AuthedRequest extends Request {
  user: { sub: string; email: string; organizationId: string; role: string };
}

@Controller('orgs/:orgId/events')
@UseGuards(AdminGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  async list(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Query('status') status?: 'DRAFT' | 'OPEN' | 'CLOSED',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ data: EventDto[] }> {
    return this.events.list(orgId, { status, from, to });
  }

  @Post()
  async create(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Body() body: CreateEventBody,
    @Req() req: AuthedRequest,
  ): Promise<EventDto> {
    return this.events.create(orgId, req.user.sub, body as CreateEventRequest);
  }

  @Get(':id')
  async get(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EventDto> {
    return this.events.get(orgId, id);
  }

  @Patch(':id')
  async update(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateEventBody,
  ): Promise<EventDto> {
    return this.events.update(orgId, id, body as UpdateEventRequest);
  }

  @Post(':id/close')
  async close(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EventDto> {
    return this.events.close(orgId, id);
  }

  @Delete(':id')
  async remove(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string }> {
    return this.events.softDelete(orgId, id);
  }

  @Post(':id/roster')
  async setRoster(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SetRosterBody,
  ) {
    return this.events.setRoster(orgId, id, body.attendeeIds);
  }

  @Get(':id/roster.csv')
  async rosterCsv(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const csv = await this.events.getRosterCsv(orgId, id);
    res
      .status(200)
      .set({ 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="event-${id}-roster.csv"` })
      .send(csv);
  }
}
