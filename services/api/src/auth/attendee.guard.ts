import { Injectable, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * AttendeeGuard: requires an authenticated user with role === 'attendee'.
 * Use on attendee-only endpoints (their own /me, /me/events, /me/attendance, etc).
 *
 * Extends JwtAuthGuard so the Bearer token (or ?token=) is verified first;
 * then checks req.user.role. If the user is an admin, returns 403.
 */
@Injectable()
export class AttendeeGuard extends JwtAuthGuard {
  override async canActivate(ctx: Parameters<JwtAuthGuard['canActivate']>[0]): Promise<boolean> {
    const ok = await super.canActivate(ctx);
    if (!ok) return false;
    const req = ctx.switchToHttp().getRequest<{ user?: { role?: string } }>();
    if (req.user?.role !== 'attendee') {
      throw new ForbiddenException('Attendee role required');
    }
    return true;
  }
}
