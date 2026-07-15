import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

interface AuthedRequest extends Request {
  user: { sub: string; email: string; organizationId: string; role: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

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
    try {
      const payload = await this.jwt.verifyAsync(token);
      // Express type for req.user is unknown; assign the payload directly.
      req.user = payload as AuthedRequest['user'];
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
