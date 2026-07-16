import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

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

  async login(email: string, password: string): Promise<{ token: string; user: AuthedUser }> {
    // Soft-deleted users can't log in. The partial unique on email means the
    // active-user lookup is what matters here.
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
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
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
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
