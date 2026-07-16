import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';

interface AuthedRequest extends Request {
  user: { sub: string; email: string; organizationId: string; role: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    let header = req.headers.authorization;
    // Fallback: ?token=<jwt> query param. Used for direct PDF/image URLs
    // that the user pastes into a browser address bar (the browser doesn't
    // attach Authorization headers on bare navigation). The query param is
    // only checked when no Authorization header is present.
    if (!header && req.query && typeof req.query.token === 'string' && req.query.token.length > 0) {
      header = `Bearer ${req.query.token}`;
    }
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }
    let payload: AuthedRequest['user'];
    try {
      payload = (await this.jwt.verifyAsync(token)) as AuthedRequest['user'];
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Soft-delete check: a User that was soft-deleted after the JWT was issued
    // (e.g. via the bulk-delete path) must not be able to keep using the old
    // token. One extra DB hit per request, but it's a primary-key lookup.
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    req.user = payload;
    return true;
  }
}
