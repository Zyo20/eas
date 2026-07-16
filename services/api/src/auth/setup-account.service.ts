import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The payload shape for setup-link JWTs.
 * Deliberately different from the auth JWT payload (no `email`, no `role`)
 * so a setup token cannot be mistaken for an auth token.
 */
export type SetupJwtPayload = {
  jti: string;     // unique ID — stored on User.setupTokenJti
  sub: string;     // userId
  purpose: 'setup';
  exp?: number;
};

/**
 * Service responsible for the setup-link JWT lifecycle:
 * 1. Sign a new token and store jti on the User row (signSetupToken)
 * 2. Peek at token info without consuming it (getSetupInfo)
 * 3. Consume the token — validate, set password, mark used (consumeSetupToken)
 */
@Injectable()
export class SetupAccountService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Sign a setup JWT for the given user and persist the jti.
   * The existing setupTokenJti is overwritten (re-issuing a link invalidates the old one).
   * @param userId  The User.id to embed as `sub`
   * @param ttlHours  Token TTL in hours (default 168 = 7 days)
   * @returns The raw JWT string (embed in setupUrl)
   */
  async signSetupToken(userId: string, ttlHours = 168): Promise<string> {
    const jti = randomUUID();
    const expiresIn = `${ttlHours}h`;
    const payload: Omit<SetupJwtPayload, 'exp'> = {
      jti,
      sub: userId,
      purpose: 'setup',
    };
    const token = await this.jwt.signAsync(payload, { expiresIn });
    // Persist the jti so we can invalidate on first use
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        setupTokenJti: jti,
        setupTokenUsedAt: null, // reset consumed marker when re-issuing
      },
    });
    return token;
  }

  /**
   * Construct a full setup URL from a raw token.
   */
  buildSetupUrl(token: string): string {
    const base =
      this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3011';
    return `${base}/setup-account?token=${token}`;
  }

  /**
   * Peek at a setup token: verify signature + purpose but DO NOT consume.
   * Returns { email, name } for display on the welcome page.
   * Throws 401 if expired/invalid, 400 if wrong purpose.
   */
  async getSetupInfo(token: string): Promise<{ email: string; name: string }> {
    const payload = await this.decodeAndAssertPurpose(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return { email: user.email, name: user.name };
  }

  /**
   * Consume the setup token:
   * 1. Verify signature + purpose
   * 2. Load the User, assert jti matches and token is not yet used
   * 3. Hash the new password, persist, mark token consumed
   * Throws 401 expired, 400 wrong purpose, 410 already consumed.
   */
  async consumeSetupToken(
    token: string,
    newPassword: string,
  ): Promise<{ id: string; email: string; name: string; role: string; organizationId: string }> {
    const payload = await this.decodeAndAssertPurpose(token);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new NotFoundException('User not found');

    // Reject if the account is soft-deleted (e.g. the Attendee was bulk-deleted
    // after the setup link was issued). The token is still cryptographically
    // valid, but the user should not be allowed to recover an account the
    // admin intentionally tombstoned.
    if (user.deletedAt !== null) {
      throw new GoneException('Account has been deactivated; contact the event admin for a new invitation');
    }

    // Single-use check
    if (user.setupTokenUsedAt !== null) {
      throw new GoneException('Setup link has already been used');
    }
    if (user.setupTokenJti !== payload.jti) {
      // jti mismatch — link was superseded by a newer issue or was cleared
      throw new GoneException('Setup link is no longer valid');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        setupTokenUsedAt: new Date(),
        setupTokenJti: null, // clear so the same jti can't replay even if UsedAt is somehow reset
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
      },
    });
    return { ...updated, role: updated.role as string };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Verify the JWT signature and assert `purpose === 'setup'`.
   * Throws 401 for invalid/expired tokens, 400 for wrong purpose.
   */
  private async decodeAndAssertPurpose(token: string): Promise<SetupJwtPayload> {
    let payload: SetupJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<SetupJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Setup link is invalid or has expired');
    }
    if (payload.purpose !== 'setup') {
      throw new BadRequestException('Token purpose is not a setup link');
    }
    return payload;
  }
}
