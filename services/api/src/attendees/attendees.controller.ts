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
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsEmail, IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength, ArrayMinSize, ArrayMaxSize, Min, Max } from 'class-validator';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import {
  AttendeesService,
  AttendeeDto,
  CsvImportResult,
  BulkCreateAccountsResult,
} from './attendees.service';
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

class BulkCreateAccountsBody {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  attendeeIds!: string[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(8760)
  expiresInHours?: number;
}

@ApiTags('attendees')
@Controller('orgs/:orgId/attendees')
@UseGuards(AdminGuard)
export class AttendeesController {
  constructor(private readonly attendees: AttendeesService) {}

  @Get()
  @ApiOperation({ summary: 'List attendees (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated attendee list' })
  async list(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{ data: AttendeeDto[]; nextCursor: string | null }> {
    return this.attendees.list(orgId, q, cursor);
  }

  @Post()
  @ApiOperation({ summary: 'Create a single attendee' })
  @ApiResponse({ status: 201, description: 'The created attendee' })
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
  @ApiOperation({ summary: 'Bulk import attendees from a CSV or Excel file' })
  @ApiResponse({ status: 201, description: 'Import result with created count and errors' })
  async import(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname?: string } | undefined,
  ): Promise<CsvImportResult> {
    if (!file) {
      throw new BadRequestException('Missing file (multipart field "file")');
    }
    const name = (file.originalname ?? '').toLowerCase();
    const isExcel =
      file.mimetype.includes('excel') ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('vnd.ms-excel') ||
      file.mimetype.includes('vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls');

    const isCsv =
      file.mimetype.includes('csv') ||
      file.mimetype.includes('text') ||
      name.endsWith('.csv');

    if (!isExcel && !isCsv) {
      throw new BadRequestException(`Expected CSV or Excel file, got ${file.mimetype}`);
    }

    return this.attendees.importFile(orgId, file.buffer, isExcel);
  }

  /**
   * Bulk create User accounts for multiple attendees.
   * Returns a partial-success result with created entries (each has a setupUrl)
   * and skipped entries (each has a reason).
   *
   * IMPORTANT: This route MUST be registered before :id routes to prevent NestJS
   * from treating the literal string "bulk-create-accounts" as a UUID param.
   */
  @Post('bulk-create-accounts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk create attendee accounts (returns setupUrls)' })
  @ApiResponse({ status: 200, description: 'Partial-success result with created + skipped entries' })
  @ApiResponse({ status: 400, description: 'Validation error (e.g. > 100 ids)' })
  async bulkCreateAccounts(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Body() body: BulkCreateAccountsBody,
  ): Promise<BulkCreateAccountsResult> {
    return this.attendees.bulkCreateAccounts(orgId, body.attendeeIds, body.expiresInHours);
  }

  /**
   * CSV variant of bulk-create-accounts.
   * GET .../bulk-create-accounts.csv?ids=uuid,uuid,...
   * Returns a text/csv response with attendeeId,identifier,fullName,email,setupUrl columns.
   */
  @Get('bulk-create-accounts.csv')
  @ApiOperation({ summary: 'Download bulk account setup links as CSV' })
  @ApiQuery({ name: 'ids', description: 'Comma-separated attendee UUIDs (max 100)' })
  @ApiResponse({ status: 200, description: 'CSV file with setup links' })
  async bulkCreateAccountsCsv(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Query('ids') ids: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!ids || !ids.trim()) {
      throw new BadRequestException('Query param "ids" is required');
    }
    const attendeeIds = ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (attendeeIds.length === 0) throw new BadRequestException('"ids" must contain at least one UUID');
    if (attendeeIds.length > 100) throw new BadRequestException('"ids" must not exceed 100 entries');

    // Validate each id is a UUID
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of attendeeIds) {
      if (!uuidRe.test(id)) throw new BadRequestException(`Invalid UUID: ${id}`);
    }

    const result = await this.attendees.bulkCreateAccounts(orgId, attendeeIds);

    // Fetch attendee details for identifier/fullName columns in the CSV
    const detailMap = await this.attendees.getAttendeeDetailsMap(orgId, attendeeIds);

    // Build CSV rows
    const header = 'attendeeId,identifier,fullName,email,setupUrl';
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = result.created.map((entry) => {
      const d = detailMap.get(entry.attendeeId);
      return [
        esc(entry.attendeeId),
        esc(d?.identifier ?? ''),
        esc(d?.fullName ?? ''),
        esc(entry.email),
        esc(entry.setupUrl),
      ].join(',');
    });

    const csv = [header, ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="setup-links.csv"');
    res.status(200).send(csv);
  }


  @Get(':id')
  @ApiOperation({ summary: 'Get a single attendee' })
  @ApiResponse({ status: 200, description: 'The attendee' })
  async get(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AttendeeDto> {
    return this.attendees.get(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an attendee' })
  @ApiResponse({ status: 200, description: 'The updated attendee' })
  async update(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAttendeeBody,
  ): Promise<AttendeeDto> {
    return this.attendees.update(orgId, id, body);
  }

  @Post(':id/regenerate-qr')
  @ApiOperation({ summary: 'Regenerate the QR secret for an attendee' })
  @ApiResponse({ status: 201, description: 'The updated attendee with new qrSecret' })
  async regenerateQr(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AttendeeDto> {
    return this.attendees.regenerateQr(orgId, id);
  }

  /**
   * Create a User account for an attendee.
   * Returns a one-time setup link (magic link). The admin copies the setupUrl
   * and relays it to the attendee — no email service in v1.1.1.
   */
  @Post(':id/create-account')
  @ApiOperation({ summary: 'Create a login account for an attendee (returns a setup link)' })
  @ApiResponse({ status: 201, description: 'Returns setupUrl for the attendee to set their password' })
  @ApiResponse({ status: 409, description: 'Attendee already has an account, or email taken' })
  async createAccount(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateAccountBody,
  ): Promise<{ attendeeId: string; userId: string; email: string; setupUrl: string; note: string }> {
    const result = await this.attendees.createAccount(orgId, id, body.email);
    return {
      ...result,
      note: 'Send the setupUrl to the attendee. It is valid for 7 days and can only be used once.',
    };
  }

  /**
   * Reset the attendee's account — issues a new setup link (invalidates the old one).
   * Use when the attendee needs to set a new password.
   */
  @Post(':id/reset-account')
  @ApiOperation({ summary: 'Issue a new setup link for an attendee (reset their password)' })
  @ApiResponse({ status: 201, description: 'Returns a new setupUrl' })
  async resetAccount(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ attendeeId: string; userId: string; email: string; setupUrl: string; note: string }> {
    const result = await this.attendees.resetAccount(orgId, id);
    return {
      ...result,
      note: 'Send the new setupUrl to the attendee. The previous setup link is now invalid.',
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an attendee' })
  @ApiResponse({ status: 200, description: 'The deleted attendee id' })
  async remove(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string }> {
    return this.attendees.remove(orgId, id);
  }
}
