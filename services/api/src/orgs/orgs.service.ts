import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return org;
  }

  async update(id: string, data: { name?: string; slug?: string }) {
    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }

  /**
   * Soft-delete every active User in the org that's an "orphan" from the
   * Attendee-bulk-delete cascade — i.e. a User whose linked Attendee is
   * soft-deleted, but the User itself wasn't (because the bulk-delete
   * happened before the cascade was wired up, or got bypassed by a buggy
   * code path).
   *
   * SCOPE: only targets attendee-Users (role: 'attendee'). Admin Users
   * are NEVER touched, even if they have no attendeeAccount link (which
   * they shouldn't, but defensive: an admin with no Attendee link is fine,
   * not an orphan).
   *
   * Returns the list of { userId, email, reason: 'linked_to_deleted_attendee' }
   * for audit. The email becomes re-usable for the next create-account call.
   *
   * Why soft and not hard: same audit-trail principle as the rest of the
   * system. An admin can hard-purge later if a retention policy requires it.
   */
  async cleanupOrphanUsers(orgId: string): Promise<{
    cleaned: { userId: string; email: string; reason: 'linked_to_deleted_attendee' }[];
    summary: { requested: number; cleaned: number };
  }> {
    // Find all ACTIVE attendee-Users in the org, with their attendee link.
    // The role filter is critical: admin Users are never cleaned, even if
    // they happen to have no attendeeAccount link.
    const users = await this.prisma.user.findMany({
      where: { organizationId: orgId, deletedAt: null, role: 'attendee' },
      select: {
        id: true,
        email: true,
        attendeeAccount: { select: { id: true, deletedAt: true } },
      },
    });

    const toClean: { id: string; email: string }[] = [];
    for (const u of users) {
      // The only orphan case we care about: linked to a soft-deleted Attendee.
      // Skip users with no Attendee link at all (admin-created standalone users
      // aren't orphans, they're just rare). Skip users linked to active Attendees
      // (they're owned, leave them alone).
      if (u.attendeeAccount && u.attendeeAccount.deletedAt !== null) {
        toClean.push({ id: u.id, email: u.email });
      }
    }

    if (toClean.length === 0) {
      return { cleaned: [], summary: { requested: users.length, cleaned: 0 } };
    }

    const now = new Date();
    await this.prisma.user.updateMany({
      where: { id: { in: toClean.map((u) => u.id) }, deletedAt: null },
      data: { deletedAt: now },
    });

    return {
      cleaned: toClean.map((u) => ({
        userId: u.id,
        email: u.email,
        reason: 'linked_to_deleted_attendee' as const,
      })),
      summary: { requested: users.length, cleaned: toClean.length },
    };
  }
}
