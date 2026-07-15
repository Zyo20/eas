import { Injectable, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * AdminGuard: requires an authenticated user with role === 'admin'.
 * Use on admin-only endpoints (org management, attendee CRUD, event CRUD, etc).
 *
 * Extends JwtAuthGuard so the Bearer token (or ?token=) is verified first;
 * then checks req.user.role. If the user is an attendee, returns 403.
 */
@Injectable()
export class AdminGuard extends JwtAuthGuard {
  override async canActivate(ctx: Parameters<JwtAuthGuard['canActivate']>[0]): Promise<boolean> {
    const ok = await super.canActivate(ctx);
    if (!ok) return false;
    const req = ctx.switchToHttp().getRequest<{ user?: { role?: string } }>();
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}
