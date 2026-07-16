import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { OrgType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterTenantDto } from './auth.controller';

export type JwtPayload = {
  sub: string; // user id
  email: string;
  organizationId: string;
  role: string;
};

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async registerTenant(dto: RegisterTenantDto): Promise<{
    organization: { id: string; name: string; slug: string; type: OrgType };
    admin: { id: string; email: string; name: string; role: string };
  }> {
    const slug = dto.orgSlug.trim().toLowerCase();
    const email = dto.adminEmail.trim().toLowerCase();

    // 1. Check slug uniqueness
    const existingOrg = await this.prisma.organization.findFirst({
      where: { slug, deletedAt: null },
    });
    if (existingOrg) {
      throw new ConflictException('Organization slug is already in use');
    }

    // 2. Check email uniqueness among active users
    const existingUser = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existingUser) {
      throw new ConflictException('Email address is already in use');
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.orgName.trim(),
          slug,
          type: dto.orgType,
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          email,
          passwordHash,
          name: dto.adminName.trim(),
          role: 'admin',
        },
      });

      return {
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          type: org.type,
        },
        admin: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    });
  }

  async login(email: string, password: string): Promise<{ token: string; user: AuthedUser }> {
    // Soft-deleted users can't log in. The partial unique on email means the
    // active-user lookup is what matters here.
    const user = await this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null },
    });
    if (!user) {
      // Use the same error either way to avoid leaking which emails are registered.
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    };
    const ttl = this.config.get<string>('AUTH_TOKEN_TTL') ?? '24h';
    const token = await this.jwt.signAsync(payload, { expiresIn: ttl });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }

  async me(userId: string): Promise<AuthedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedException('User not found or account has been deactivated');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    };
  }
}
