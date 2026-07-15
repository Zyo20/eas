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
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AttendeesService, AttendeeDto, CsvImportResult } from './attendees.service';
import { AdminGuard } from '../auth/admin.guard';

class CreateAttendeeBody {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsEmail()
  email!: string;
}

class UpdateAttendeeBody {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  identifier?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

class CreateAccountBody {
  @IsEmail()
  email!: string;
}

@Controller('orgs/:orgId/attendees')
@UseGuards(AdminGuard)
export class AttendeesController {
  constructor(private readonly attendees: AttendeesService) {}

  @Get()
  async list(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{ data: AttendeeDto[]; nextCursor: string | null }> {
    return this.attendees.list(orgId, q, cursor);
  }

  @Post()
  async create(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Body() body: CreateAttendeeBody,
  ): Promise<AttendeeDto> {
    return this.attendees.create(orgId, {
      identifier: body.identifier,
      fullName: body.fullName,
      email: body.email,
    });
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
  ): Promise<CsvImportResult> {
    if (!file) {
      throw new BadRequestException('Missing file (multipart field "file")');
    }
    if (!file.mimetype.includes('csv') && !file.mimetype.includes('text')) {
      throw new BadRequestException(`Expected CSV, got ${file.mimetype}`);
    }
    return this.attendees.importCsv(orgId, file.buffer.toString('utf8'));
  }

  @Get(':id')
  async get(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AttendeeDto> {
    return this.attendees.get(orgId, id);
  }

  @Patch(':id')
  async update(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAttendeeBody,
  ): Promise<AttendeeDto> {
    return this.attendees.update(orgId, id, body);
  }

  @Post(':id/regenerate-qr')
  async regenerateQr(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AttendeeDto> {
    return this.attendees.regenerateQr(orgId, id);
  }

  /**
   * Create a User account for an attendee.
   * Returns the temporary password (admin relays to attendee out-of-band; v1 has no email service).
   * Throws 409 if the attendee already has an account or the email is taken.
   */
  @Post(':id/create-account')
  async createAccount(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateAccountBody,
  ): Promise<{ attendeeId: string; userId: string; email: string; tempPassword: string; note: string }> {
    const result = await this.attendees.createAccount(orgId, id, body.email);
    return {
      ...result,
      note: 'This temp password is shown only once. The admin must relay it to the attendee (v1 has no email service).',
    };
  }

  /**
   * Reset the attendee's account password. Returns a new temp password.
   * Use when the attendee forgot their password or to rotate after a security event.
   */
  @Post(':id/reset-account')
  async resetAccount(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ attendeeId: string; userId: string; email: string; tempPassword: string; note: string }> {
    const result = await this.attendees.resetAccount(orgId, id);
    return {
      ...result,
      note: 'This temp password is shown only once. The admin must relay it to the attendee (v1 has no email service).',
    };
  }

  @Delete(':id')
  async remove(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string }> {
    return this.attendees.remove(orgId, id);
  }
}
