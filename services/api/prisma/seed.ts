/**
 * Seed: create the LLCC test org + admin user.
 * Idempotent — re-runs update rather than fail.
 *
 * Env vars consumed (from `services/api/.env`):
 *   - DATABASE_URL
 *   - SEED_ORG_NAME, SEED_ORG_SLUG, SEED_ORG_TYPE
 *   - SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 *   - SEED_ATTENDEE_EMAIL, SEED_ATTENDEE_PASSWORD, SEED_ATTENDEE_IDENTIFIER (optional)
 *     If all 3 are set, the seed ALSO ensures an Attendee row exists for
 *     SEED_ATTENDEE_IDENTIFIER and links it to a User account (role=attendee)
 *     with the given email + password. Useful for the demo flow + tests.
 */

import { PrismaClient, OrgType, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function parseOrgType(v: string): OrgType {
  if (v === 'SCHOOL' || v === 'ORG') return v;
  throw new Error(`SEED_ORG_TYPE must be SCHOOL or ORG, got: ${v}`);
}

async function main() {
  const orgName = requireEnv('SEED_ORG_NAME');
  const orgSlug = requireEnv('SEED_ORG_SLUG');
  const orgType = parseOrgType(requireEnv('SEED_ORG_TYPE'));
  const adminEmail = requireEnv('SEED_ADMIN_EMAIL');
  const adminPassword = requireEnv('SEED_ADMIN_PASSWORD');

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    create: { name: orgName, slug: orgSlug, type: orgType },
    update: { name: orgName, type: orgType },
  });
  console.log(`[seed] org: ${org.id}  ${org.name}  (${org.slug}, ${org.type})`);

  // 2. Admin user (idempotent on email).
  // After the soft-delete migration, User.email is no longer a Prisma
  // @unique (it's a raw partial index). Switch from upsert to a
  // findFirst+create-or-update pattern. Also: if a previous run left
  // a soft-deleted admin row, re-activate it instead of failing on the
  // partial unique.
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const existingAdmin = await prisma.user.findFirst({
    where: { email: adminEmail, deletedAt: null },
  });
  let admin: { id: string; email: string };
  if (existingAdmin) {
    admin = await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        // Refresh the hash so re-runs always have a valid login for the current password.
        passwordHash,
        name: 'LLCC Admin',
        role: UserRole.admin,
      },
    });
  } else {
    admin = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: adminEmail,
        name: 'LLCC Admin',
        role: UserRole.admin,
        passwordHash,
      },
    });
  }
  console.log(`[seed] admin: ${admin.id}  ${admin.email}  (org=${org.id})`);

  // 3. Demo attendee (only if all 3 SEED_ATTENDEE_* vars are set)
  const attendeeEmail = process.env.SEED_ATTENDEE_EMAIL;
  const attendeePassword = process.env.SEED_ATTENDEE_PASSWORD;
  const attendeeIdentifier = process.env.SEED_ATTENDEE_IDENTIFIER;
  if (attendeeEmail && attendeePassword && attendeeIdentifier) {
    // Find the Attendee row (created by demo usage) by identifier+org, or skip.
    // After soft-delete migration, there's no longer a model-level unique on
    // (organizationId, identifier) — it's a raw partial index. Use findFirst.
    const attendee = await prisma.attendee.findFirst({
      where: { organizationId: org.id, identifier: attendeeIdentifier, deletedAt: null },
    });
    if (!attendee) {
      console.log(`[seed] attendee: skipped — no Attendee row with identifier=${attendeeIdentifier} for org ${org.slug}. Create via POST /orgs/:orgId/attendees first.`);
    } else {
      const attendeeHash = await bcrypt.hash(attendeePassword, 10);
      // Same findFirst+create-or-update as the admin path (email is not a
      // Prisma @unique after the soft-delete migration).
      const existingAttendeeUser = await prisma.user.findFirst({
        where: { email: attendeeEmail, deletedAt: null },
      });
      const attendeeUser = existingAttendeeUser
        ? await prisma.user.update({
            where: { id: existingAttendeeUser.id },
            data: {
              passwordHash: attendeeHash,
              name: attendee.fullName,
              role: UserRole.attendee,
            },
          })
        : await prisma.user.create({
            data: {
              organizationId: org.id,
              email: attendeeEmail,
              name: attendee.fullName,
              role: UserRole.attendee,
              passwordHash: attendeeHash,
            },
          });
      // Link the Attendee row to the User
      await prisma.attendee.update({
        where: { id: attendee.id },
        data: { userId: attendeeUser.id },
      });
      console.log(`[seed] attendee: ${attendeeUser.id}  ${attendeeUser.email}  (linked to attendee ${attendee.id})`);
    }
  }

  console.log('[seed] done.');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
