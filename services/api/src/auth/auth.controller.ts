import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { OrgType } from '@prisma/client';
import { AuthService, AuthedUser } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SetupAccountService } from './setup-account.service';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class SetupAccountDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class RegisterTenantDto {
  @ApiProperty({ description: 'The name of the organization' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  orgName!: string;

  @ApiProperty({ description: 'The unique slug for the organization (lowercase alphanumeric with hyphens)' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'slug must be lowercase alphanumeric with hyphens' })
  orgSlug!: string;

  @ApiProperty({ enum: OrgType, description: 'The type of organization' })
  @IsEnum(OrgType)
  orgType!: OrgType;

  @ApiProperty({ description: 'The full name of the administrator' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  adminName!: string;

  @ApiProperty({ description: 'The email address of the administrator' })
  @IsEmail()
  adminEmail!: string;

  @ApiProperty({ description: 'The password of the administrator (min 8 chars)' })
  @IsString()
  @MinLength(8)
  adminPassword!: string;
}

export class RegisterTenantResponseDto {
  @ApiProperty()
  organization!: {
    id: string;
    name: string;
    slug: string;
    type: OrgType;
  };

  @ApiProperty()
  admin!: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export class RegisterTenantDataResponseDto {
  @ApiProperty({ type: RegisterTenantResponseDto })
  data!: RegisterTenantResponseDto;
}

interface AuthedRequest extends Request {
  user: { sub: string; email: string; organizationId: string; role: string };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly setupAccountSvc: SetupAccountService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Returns a JWT token and user info' })
  async login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Post('register-tenant')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new tenant (organization + admin user)' })
  @ApiResponse({ status: 201, type: RegisterTenantDataResponseDto, description: 'Tenant registered successfully' })
  @ApiResponse({ status: 409, description: 'Slug or email already in use' })
  async registerTenant(@Body() body: RegisterTenantDto): Promise<RegisterTenantDataResponseDto> {
    const result = await this.auth.registerTenant(body);
    return { data: result };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiResponse({ status: 200, description: 'Returns the current user' })
  async me(@Req() req: AuthedRequest): Promise<AuthedUser> {
    return this.auth.me(req.user.sub);
  }

  /**
   * Peek at a setup token — returns the user's name + email for the welcome page.
   * Does NOT consume the token. Public (no auth required).
   */
  @Get('setup-info')
  @ApiOperation({ summary: 'Peek at a setup token without consuming it' })
  @ApiResponse({ status: 200, description: 'Returns name and email from the token' })
  @ApiResponse({ status: 401, description: 'Token invalid or expired' })
  @ApiResponse({ status: 400, description: 'Token is not a setup token' })
  async setupInfo(@Query('token') token: string): Promise<{ email: string; name: string }> {
    return this.setupAccountSvc.getSetupInfo(token);
  }

  /**
   * Consume a setup token — validates the one-time token, sets the new password,
   * marks the token consumed, and returns the user. Public (no auth required).
   * Returns 410 if the token has already been used.
   */
  @Post('setup-account')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Consume a setup token and set a new password' })
  @ApiResponse({ status: 201, description: 'Password set — returns the updated user' })
  @ApiResponse({ status: 401, description: 'Token invalid or expired' })
  @ApiResponse({ status: 410, description: 'Token already consumed' })
  async setupAccount(
    @Body() body: SetupAccountDto,
  ): Promise<{ id: string; email: string; name: string; role: string; organizationId: string }> {
    return this.setupAccountSvc.consumeSetupToken(body.token, body.newPassword);
  }
}

