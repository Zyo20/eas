import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { OrgsService } from './orgs.service';
import { AdminGuard } from '../auth/admin.guard';

class UpdateOrgDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'slug must be lowercase alphanumeric with hyphens' })
  slug?: string;
}

@Controller('orgs')
@UseGuards(AdminGuard)
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.orgs.getById(id);
  }

  @Patch(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateOrgDto) {
    return this.orgs.update(id, body);
  }

  /**
   * Soft-delete every active User in the org that is "orphaned":
   *   - linked to a soft-deleted Attendee (the Attendee + User should have
   *     been soft-deleted together by the bulk-delete path; this catches
   *     state from before the cascade was wired up, or rows left behind by
   *     earlier test runs)
   *   - OR not linked to any Attendee at all (a User with no owner)
   *
   * Returns the list of { userId, email, reason } for audit. The email becomes
   * re-usable for the next create-account call.
   *
   * Why soft and not hard: same audit-trail principle as the rest of the
   * system. An admin can hard-purge later if a retention policy requires it.
   */
  @Post(':id/cleanup-orphan-users')
  async cleanupOrphanUsers(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.orgs.cleanupOrphanUsers(id);
  }
}
