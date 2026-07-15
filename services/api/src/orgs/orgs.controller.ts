import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
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
}
