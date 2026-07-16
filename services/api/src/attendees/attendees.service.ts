import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { UserRole } from '@prisma/client';
import { CreateAttendeeRequest, UpdateAttendeeRequest } from '@eas/shared';
import { SetupAccountService } from '../auth/setup-account.service';
import { MailService } from '../mail/mail.service';

export type AttendeeDto = {
  id: string;
  organizationId: string;
  identifier: string;
  fullName: string;
  email: string;
  qrSecret: string;
  photoUrl: string | null;
  hasAccount: boolean; // true if Attendee.userId is set
  createdAt: string;
  deletedAt: string | null;
};

export type CsvImportError = { row: number; message: string };
export type CsvImportResult = { created: number; errors: CsvImportError[] };

export type BulkCreatedEntry = {
  attendeeId: string;
  email: string;
  setupUrl: string;
  /**
   * True if the setup email was delivered successfully. False if the SMTP
   * send failed (rate limit, network blip, etc.) — the admin still has
   * `setupUrl` to copy/paste manually.
   */
  emailSent: boolean;
  /**
   * If the email send failed, the SMTP error message. Useful for the admin
   * to know whether to retry, switch providers, or just copy the URL.
   */
  emailError?: string;
};

export type BulkSkipReason = 'already_has_account' | 'missing_email' | 'email_taken' | 'not_found';

export type BulkSkippedEntry = {
  attendeeId: string;
  reason: BulkSkipReason;
};

export type BulkCreateAccountsResult = {
  created: BulkCreatedEntry[];
  skipped: BulkSkippedEntry[];
  summary: { requested: number; created: number; skipped: number; emailFailures: number };
};

export type BulkDeleteSkipReason = 'not_found' | 'already_deleted';

export type BulkDeletedEntry = {
  attendeeId: string;
  identifier: string;
  fullName: string;
  deletedAt: string;
};

export type BulkDeleteResult = {
  deleted: BulkDeletedEntry[];
  skipped: { attendeeId: string; reason: BulkDeleteSkipReason }[];
  summary: { requested: number; deleted: number; skipped: number };
};

const PAGE_SIZE = 50;

@Injectable()
export class AttendeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly setupTokenSvc: SetupAccountService,
    private readonly mailService: MailService,
  ) {}

  private toDto(a: {
    id: string;
    organizationId: string;
    identifier: string;
    fullName: string;
    email: string;
    qrSecret: string;
    photoUrl: string | null;
    userId: string | null;
    createdAt: Date;
    deletedAt: Date | null;
  }): AttendeeDto {
    return {
      id: a.id,
      organizationId: a.organizationId,
      identifier: a.identifier,
      fullName: a.fullName,
      email: a.email,
      qrSecret: a.qrSecret,
      photoUrl: a.photoUrl,
      hasAccount: a.userId !== null,
      createdAt: a.createdAt.toISOString(),
      deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
    };
  }

  async assertOrgExists(orgId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }
    return org;
  }

  async create(orgId: string, body: CreateAttendeeRequest): Promise<AttendeeDto> {
    await this.assertOrgExists(orgId);
    try {
      const created = await this.prisma.attendee.create({
        data: {
          organizationId: orgId,
          identifier: body.identifier,
          fullName: body.fullName,
          email: body.email,
        },
      });
      return this.toDto(created);
    } catch (err) {
      const e = err as { code?: string; meta?: Record<string, unknown> };
      if (e.code === 'P2002') {
        throw new ConflictException(
          `Attendee with identifier "${body.identifier}" already exists in this organization`,
        );
      }
      throw err;
    }
  }

  /**
   * Create a User account for an Attendee and link them via Attendee.userId.
   * Returns a setupUrl (magic link valid for SETUP_LINK_TTL hours, default 168).
   * The admin copies the setupUrl and relays it to the attendee — no email service in v1.1.1.
   *
   * Throws ConflictException if the attendee already has an ACTIVE account, or if
   * the email is taken by an ACTIVE user. Soft-deleted users don't count.
   *
   * Re-activation path: if Attendee.userId points at a soft-deleted User, we
   * re-activate that User (clear deletedAt, reset passwordHash) and reuse the id,
   * instead of creating a brand-new User. The email doesn't change because we
   * reuse the existing row. This makes the lifecycle "delete then re-create
   * account" round-trippable.
   */
  async createAccount(
    orgId: string,
    attendeeId: string,
    email: string,
  ): Promise<{
    attendeeId: string;
    userId: string;
    email: string;
    setupUrl: string;
    emailSent: boolean;
    emailError?: string;
  }> {
    const attendee = await this.prisma.attendee.findFirst({
      where: { id: attendeeId, organizationId: orgId, deletedAt: null },
    });
    if (!attendee) {
      // Either it doesn't exist OR it's soft-deleted. The admin UI should
      // never offer this operation for a soft-deleted attendee (the list
      // filters them out), so if we got here, the caller is using a stale
      // id from before the delete. Reject explicitly so we don't accidentally
      // re-activate a soft-deleted User through a dead Attendee id.
      throw new NotFoundException(`Attendee ${attendeeId} not found or has been removed`);
    }

    // If the attendee is linked to a user, check whether that user is active
    // or soft-deleted. Active = real account exists, surface a reset hint.
    if (attendee.userId) {
      const linked = await this.prisma.user.findUnique({ where: { id: attendee.userId } });
      if (linked && linked.deletedAt === null) {
        throw new ConflictException(
          `Attendee already has an account. Use POST /attendees/:id/reset-account to issue a new setup link.`,
        );
      }
      // If linked is null or linked.deletedAt is set, fall through and
      // re-activate / re-create below.
    }

    // Email must be unique across ACTIVE users. Soft-deleted users are
    // ignored so an admin can re-use the email after the original owner
    // was soft-deleted. If the email is held by an active User with no
    // Attendee link, or linked to a soft-deleted Attendee, point the admin
    // at the cleanup endpoint — that's almost always what's needed.
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        `Email ${email} is already registered to a user. ` +
          `If this is a leftover from a deleted attendee, run ` +
          `POST /api/v1/orgs/${orgId}/cleanup-orphan-users to free the email.`,
      );
    }

    let userId: string;

    if (attendee.userId) {
      // Re-activate the soft-deleted User attached to this Attendee.
      // (We already checked it's not active above.)
      const reactivated = await this.prisma.user.update({
        where: { id: attendee.userId },
        data: {
          email,
          passwordHash: '*', // placeholder; replaced when setup link is consumed
          name: attendee.fullName,
          role: UserRole.attendee,
          deletedAt: null,
          setupTokenJti: null,   // clear any stale setup-link marker
          setupTokenUsedAt: null,
        },
      });
      userId = reactivated.id;
    } else {
      // Create a fresh User.
      const created = await this.prisma.user.create({
        data: {
          organizationId: orgId,
          email,
          passwordHash: '*', // placeholder; replaced when setup link is consumed
          name: attendee.fullName,
          role: UserRole.attendee,
        },
      });
      userId = created.id;
      await this.prisma.attendee.update({
        where: { id: attendeeId },
        data: { userId },
      });
    }

    const ttlHours = Number(this.getSetupLinkTtl());
    const token = await this.setupTokenSvc.signSetupToken(userId, ttlHours);
    const setupUrl = this.setupTokenSvc.buildSetupUrl(token);

    // Best-effort email. If SMTP fails, the URL is still in the response so
    // the admin can copy/paste manually — we just flag it via emailSent.
    const mailResult = await this.mailService.trySendSetupEmail(
      email,
      attendee.fullName,
      setupUrl,
      ttlHours,
    );

    return {
      attendeeId,
      userId,
      email,
      setupUrl,
      emailSent: mailResult.ok,
      ...(mailResult.ok ? {} : { emailError: mailResult.errorMessage }),
    };
  }

  /**
   * Reset the attendee's account — issues a new setup link.
   * The attendee's current password is invalidated until they consume the new link.
   *
   * If the linked User was soft-deleted (e.g. via the bulk-delete flow that
   * happened after the original account creation), re-activate it and proceed.
   */
  async resetAccount(
    orgId: string,
    attendeeId: string,
  ): Promise<{
    attendeeId: string;
    userId: string;
    email: string;
    setupUrl: string;
    emailSent: boolean;
    emailError?: string;
  }> {
    const attendee = await this.prisma.attendee.findFirst({
      where: { id: attendeeId, organizationId: orgId },
    });
    if (!attendee) throw new NotFoundException(`Attendee ${attendeeId} not found`);
    if (!attendee.userId) {
      throw new BadRequestException(
        `Attendee has no account yet. Use POST /attendees/:id/create-account first.`,
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: attendee.userId } });
    if (!user) throw new NotFoundException(`Linked user not found`);

    // If the linked User was soft-deleted, re-activate it before issuing the link.
    // Guard: make sure no OTHER active user already holds this email. This can
    // happen if the original attendee was deleted, the email was reused for a
    // different new account, and the admin then tries to reset the old attendee.
    // Re-activating in that scenario would produce two active users with the
    // same email and violate the partial-unique index.
    let activeUser = user;
    if (user.deletedAt !== null) {
      const emailConflict = await this.prisma.user.findFirst({
        where: { email: user.email, deletedAt: null, NOT: { id: user.id } },
        select: { id: true },
      });
      if (emailConflict) {
        throw new ConflictException(
          `Cannot re-activate account: email ${user.email} is already registered to another active user. ` +
          `Use POST /attendees/:id/create-account with a different email instead.`,
        );
      }
      activeUser = await this.prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: null },
      });
    }

    const ttlHours = Number(this.getSetupLinkTtl());
    const token = await this.setupTokenSvc.signSetupToken(activeUser.id, ttlHours);
    const setupUrl = this.setupTokenSvc.buildSetupUrl(token);

    // Best-effort email. If SMTP fails, the URL is still in the response so
    // the admin can copy/paste manually — we just flag it via emailSent.
    const mailResult = await this.mailService.trySendSetupEmail(
      activeUser.email,
      attendee.fullName,
      setupUrl,
      ttlHours,
    );

    return {
      attendeeId,
      userId: activeUser.id,
      email: activeUser.email,
      setupUrl,
      emailSent: mailResult.ok,
      ...(mailResult.ok ? {} : { emailError: mailResult.errorMessage }),
    };
  }

  /**
   * Bulk create User accounts for a list of attendees.
   * Partial-success: attendees that fail (already has active account, missing email, etc.)
   * are reported in `skipped`. Successfully provisioned ones are in `created`.
   * Max 100 attendeeIds per call (enforced by the controller/DTO).
   *
   * Re-activation: if an Attendee is linked to a soft-deleted User, the
   * bulk path re-activates that User (same as the single createAccount path).
   * Email uniqueness is enforced only against ACTIVE users, so an admin can
   * re-bulk-create accounts after a bulk-delete.
   */
  async bulkCreateAccounts(
    orgId: string,
    attendeeIds: string[],
    expiresInHours = 168,
  ): Promise<BulkCreateAccountsResult> {
    // Fetch all requested attendees that are still active. Soft-deleted
    // attendees are ignored — operating on them would let an admin resurrect
    // a User through a tombstoned Attendee id, which is never the intent.
    const found = await this.prisma.attendee.findMany({
      where: { id: { in: attendeeIds }, organizationId: orgId, deletedAt: null },
    });
    const foundMap = new Map(found.map((a) => [a.id, a]));

    // Collect the emails we'll potentially create against, and check which
    // are taken by any ACTIVE user. Soft-deleted users are ignored.
    const emailsToCheck = found
      .filter((a) => a.email)
      .map((a) => a.email as string);
    const takenUsers = emailsToCheck.length
      ? await this.prisma.user.findMany({
          where: { email: { in: emailsToCheck }, deletedAt: null },
          select: { email: true },
        })
      : [];
    const takenEmails = new Set(takenUsers.map((u) => u.email));

    const created: BulkCreatedEntry[] = [];
    const skipped: BulkSkippedEntry[] = [];
    let emailFailures = 0;

    for (const attendeeId of attendeeIds) {
      const attendee = foundMap.get(attendeeId);
      if (!attendee) {
        skipped.push({ attendeeId, reason: 'not_found' });
        continue;
      }

      // If the Attendee has a userId, decide based on the linked User's state.
      // - Active user → real account, surface "already_has_account" so the
      //   admin uses the reset-account path explicitly.
      // - Soft-deleted user → re-activate below (same as the single-account path).
      // - No user (null) → fresh create.
      let reActivate: { id: string } | null = null;
      if (attendee.userId) {
        const linked = await this.prisma.user.findUnique({
          where: { id: attendee.userId },
          select: { id: true, deletedAt: true },
        });
        if (linked && linked.deletedAt === null) {
          skipped.push({ attendeeId, reason: 'already_has_account' });
          continue;
        }
        if (linked) {
          // Soft-deleted — re-activate later in this loop iteration.
          reActivate = { id: linked.id };
        }
        // If linked is null, treat as "no linked user" and fall through to
        // the fresh-create path.
      }

      if (!attendee.email) {
        skipped.push({ attendeeId, reason: 'missing_email' });
        continue;
      }
      if (takenEmails.has(attendee.email)) {
        skipped.push({ attendeeId, reason: 'email_taken' });
        continue;
      }

      // Create OR re-activate the User, and link the Attendee in one transaction.
      try {
        const user = await this.prisma.$transaction(async (tx) => {
          if (reActivate) {
            const u = await tx.user.update({
              where: { id: reActivate.id },
              data: {
                email: attendee.email!,
                passwordHash: '*', // placeholder until setup link consumed
                name: attendee.fullName,
                role: UserRole.attendee,
                deletedAt: null,
                setupTokenJti: null,
                setupTokenUsedAt: null,
              },
            });
            // Make sure the Attendee is pointing at this user (it should
            // already, since we got the id from the Attendee.userId link).
            await tx.attendee.update({
              where: { id: attendeeId },
              data: { userId: u.id },
            });
            return u;
          }
          const u = await tx.user.create({
            data: {
              organizationId: orgId,
              email: attendee.email!,
              passwordHash: '*', // placeholder until setup link consumed
              name: attendee.fullName,
              role: UserRole.attendee,
            },
          });
          await tx.attendee.update({
            where: { id: attendeeId },
            data: { userId: u.id },
          });
          return u;
        });

        // Sign setup token after the transaction has successfully committed
        const token = await this.setupTokenSvc.signSetupToken(user.id, expiresInHours);
        const setupUrl = this.setupTokenSvc.buildSetupUrl(token);

        // Best-effort email send. The User has already been created and the
        // setup token signed — if SMTP fails (rate limit, network blip),
        // we still surface the setupUrl to the admin so they can copy/paste
        // it manually. emailSent:false on the created entry flags it.
        const mailResult = await this.mailService.trySendSetupEmail(
          attendee.email!,
          attendee.fullName,
          setupUrl,
          expiresInHours,
        );

        // Build the created entry. Extract fields up front so TS can narrow
        // the discriminated union without confusing it via a nested ternary.
        const createdEntry: BulkCreatedEntry = mailResult.ok
          ? { attendeeId, email: attendee.email!, setupUrl, emailSent: true }
          : {
              attendeeId,
              email: attendee.email!,
              setupUrl,
              emailSent: false,
              emailError: mailResult.errorMessage,
            };
        if (!mailResult.ok) {
          emailFailures++;
        }
        created.push(createdEntry);
        // Mark the email as now taken so duplicate emails in the same batch are caught
        takenEmails.add(attendee.email!);
      } catch (err) {
        // Rare race condition (e.g. email taken between the pre-check and create).
        // The User may or may not have been created in the failed transaction —
        // either way, the next iteration's pre-check (takenEmails + DB lookup)
        // will report the right skip reason. We just record it here.
        skipped.push({ attendeeId, reason: 'email_taken' });
      }
    }

    return {
      created,
      skipped,
      summary: {
        requested: attendeeIds.length,
        created: created.length,
        skipped: skipped.length,
        emailFailures,
      },
    };
  }

  async list(
    orgId: string,
    q: string | undefined,
    cursor: string | undefined,
  ): Promise<{ data: AttendeeDto[]; nextCursor: string | null }> {
    await this.assertOrgExists(orgId);
    const where = {
      organizationId: orgId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { identifier: { contains: q, mode: 'insensitive' as const } },
              { fullName: { contains: q, mode: 'insensitive' as const } },
              ...(q.includes('@') ? [{ email: { contains: q, mode: 'insensitive' as const } }] : []),
            ],
          }
        : {}),
    };
    const items = await this.prisma.attendee.findMany({
      where,
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = items.length > PAGE_SIZE;
    const data = items.slice(0, PAGE_SIZE).map((a) => this.toDto(a));
    return { data, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null };
  }

  async get(orgId: string, id: string): Promise<AttendeeDto> {
    const a = await this.prisma.attendee.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!a) throw new NotFoundException(`Attendee ${id} not found`);
    return this.toDto(a);
  }

  async update(orgId: string, id: string, body: UpdateAttendeeRequest): Promise<AttendeeDto> {
    const existing = await this.prisma.attendee.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException(`Attendee ${id} not found`);
    try {
      const updated = await this.prisma.attendee.update({
        where: { id },
        data: {
          ...(body.identifier !== undefined ? { identifier: body.identifier } : {}),
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
        },
      });
      return this.toDto(updated);
    } catch (err) {
      // P2002 on the partial unique index = another active row with the same
      // (organizationId, identifier) already exists.
      const e = err as { code?: string };
      if (e.code === 'P2002') {
        throw new ConflictException(
          `Attendee with identifier "${body.identifier}" already exists in this organization`,
        );
      }
      throw err;
    }
  }

  async regenerateQr(orgId: string, id: string): Promise<AttendeeDto> {
    const existing = await this.prisma.attendee.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException(`Attendee ${id} not found`);
    // Setting qrSecret back to the default expression value rotates the secret.
    const updated = await this.prisma.$queryRaw<
      Array<{
        id: string;
        organizationId: string;
        identifier: string;
        fullName: string;
        email: string;
        qrSecret: string;
        photoUrl: string | null;
        userId: string | null;
        createdAt: Date;
        deletedAt: Date | null;
      }>
    >`UPDATE "Attendee" SET "qrSecret" = gen_random_uuid() WHERE id = ${id}::uuid RETURNING *`;
    const row = updated[0];
    if (!row) throw new NotFoundException('Attendee disappeared after QR rotation');
    return this.toDto(row);
  }

  /**
   * Soft-delete a single attendee. The row stays in the DB with `deletedAt`
   * set; all user-facing read paths filter on `deletedAt: null` so it disappears
   * from the list, the QR code, the check-in flow, etc. — but the historical
   * AttendanceRecord / EventRoster rows are preserved for audit.
   *
   * Side effect: if the Attendee is linked to a User (had an account), that
   * User is also soft-deleted in the same transaction. This frees the email
   * for re-use when the admin re-creates the Attendee later. Without it, the
   * next create-account call would 409 with "email already registered to a
   * user" because User.email is unique.
   *
   * Safe to call on attendees that have records; no longer throws ConflictException
   * on records (the v1 hard-delete did; that gate is gone with soft-delete).
   */
  async remove(orgId: string, id: string): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendee.findFirst({
        where: { id, organizationId: orgId, deletedAt: null },
        select: { id: true, userId: true },
      });
      if (!existing) throw new NotFoundException(`Attendee ${id} not found`);
      const now = new Date();
      await tx.attendee.update({
        where: { id },
        data: { deletedAt: now },
      });
      if (existing.userId) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { deletedAt: now },
        });
      }
      return { id };
    });
  }

  /**
   * Bulk soft-delete. Partial-success: ids that don't exist or are already
   * soft-deleted are reported in `skipped`, the rest are tombstoned in one
   * UPDATE. Returns the deleted rows' identifier + fullName so the UI can
   * show "what just happened."
   *
   * Why soft: AttendanceRecord has onDelete: Cascade from Attendee, so a hard
   * delete would nuke historical check-in data. Soft-delete keeps the audit
   * trail while removing the attendee from the active roster.
   *
   * Linked-User side effect: for any deleted Attendee with userId != null, the
   * linked User is also soft-deleted in the same transaction. Frees the email
   * for re-use, otherwise re-creating the same Attendee + create-account would
   * 409 with "email already registered to a user".
   */
  async bulkDelete(orgId: string, ids: string[]): Promise<BulkDeleteResult> {
    await this.assertOrgExists(orgId);
    if (ids.length === 0) {
      return { deleted: [], skipped: [], summary: { requested: 0, deleted: 0, skipped: 0 } };
    }

    return this.prisma.$transaction(async (tx) => {
      // Fetch the active rows we're going to delete, with a select of what
      // the UI needs to render the result.
      const found = await tx.attendee.findMany({
        where: { id: { in: ids }, organizationId: orgId, deletedAt: null },
        select: { id: true, identifier: true, fullName: true, userId: true },
      });
      const foundMap = new Map(found.map((a) => [a.id, a]));

      // If a requested id isn't in foundMap, figure out why: it doesn't
      // exist at all, or it's already soft-deleted.
      const notFoundOrDeleted = ids.filter((id) => !foundMap.has(id));
      const skipped: { attendeeId: string; reason: BulkDeleteSkipReason }[] = [];
      if (notFoundOrDeleted.length > 0) {
        const any = await tx.attendee.findMany({
          where: { id: { in: notFoundOrDeleted }, organizationId: orgId },
          select: { id: true, deletedAt: true },
        });
        const anyMap = new Map(any.map((a) => [a.id, a]));
        for (const id of notFoundOrDeleted) {
          const row = anyMap.get(id);
          if (!row) {
            skipped.push({ attendeeId: id, reason: 'not_found' });
          } else {
            skipped.push({ attendeeId: id, reason: 'already_deleted' });
          }
        }
      }

      // Tombstone the active rows in one UPDATE per table.
      let deleted: BulkDeletedEntry[] = [];
      if (found.length > 0) {
        const now = new Date();
        await tx.attendee.updateMany({
          where: { id: { in: found.map((a) => a.id) }, organizationId: orgId, deletedAt: null },
          data: { deletedAt: now },
        });
        const linkedUserIds = found.map((a) => a.userId).filter((u): u is string => !!u);
        if (linkedUserIds.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: linkedUserIds }, deletedAt: null },
            data: { deletedAt: now },
          });
        }
        deleted = found.map((a) => ({
          attendeeId: a.id,
          identifier: a.identifier,
          fullName: a.fullName,
          deletedAt: now.toISOString(),
        }));
      }

      return {
        deleted,
        skipped,
        summary: {
          requested: ids.length,
          deleted: deleted.length,
          skipped: skipped.length,
        },
      };
    });
  }

  /**
   * Bulk import via CSV.
   * Expected columns: identifier, fullName, email (header row required).
   * Email is REQUIRED (needed for account creation).
   * Per §4: returns { created, errors }. Malformed rows are reported, not fatal.
   */
  async importCsv(orgId: string, csvText: string): Promise<CsvImportResult> {
    return this.importFile(orgId, Buffer.from(csvText, 'utf8'), false);
  }

  /**
   * Bulk import via CSV or Excel file.
   * Expected columns: identifier, fullName, email (header row required).
   * Email is REQUIRED (needed for account creation).
   * Per §4: returns { created, errors }. Malformed rows are reported, not fatal.
   */
  async importFile(orgId: string, buffer: Buffer, isExcel: boolean): Promise<CsvImportResult> {
    await this.assertOrgExists(orgId);
    let rows: Array<Record<string, string>> = [];
    if (isExcel) {
      try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new BadRequestException('Excel file has no sheets');
        }
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new BadRequestException('Excel worksheet is empty or missing');
        }
        rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet).map((row) => {
          const cleanRow: Record<string, string> = {};
          Object.entries(row).forEach(([k, v]) => {
            cleanRow[k.trim()] = String(v ?? '').trim();
          });
          return cleanRow;
        });
      } catch (err) {
        throw new BadRequestException(`Excel parse error: ${(err as Error).message}`);
      }
    } else {
      const csvText = buffer.toString('utf8');
      if (!csvText.trim()) {
        throw new BadRequestException('CSV is empty');
      }
      const parsed = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      if (parsed.errors.length > 0) {
        const first = parsed.errors[0]!;
        throw new BadRequestException(`CSV parse error at row ${first.row}: ${first.message}`);
      }
      rows = parsed.data;
    }

    if (rows.length === 0) {
      throw new BadRequestException('File has no data rows');
    }

    const errors: CsvImportError[] = [];
    let created = 0;
    // Use createMany where possible; fall back to per-row for clearer error attribution.
    const seenIdentifiers = new Set<string>();
    const seenEmails = new Set<string>();
    const toCreate: Array<{ organizationId: string; identifier: string; fullName: string; email: string }> = [];
    rows.forEach((row, idx) => {
      const lineNo = idx + 2; // +1 for header, +1 for 1-indexing
      const identifier = (row['identifier'] ?? '').trim();
      const fullName = (row['fullName'] ?? '').trim();
      const email = (row['email'] ?? '').trim();
      if (!identifier) {
        errors.push({ row: lineNo, message: 'missing identifier' });
        return;
      }
      if (!fullName) {
        errors.push({ row: lineNo, message: 'missing fullName' });
        return;
      }
      if (!email) {
        errors.push({ row: lineNo, message: 'missing email (required for account creation)' });
        return;
      }
      if (!email.includes('@')) {
        errors.push({ row: lineNo, message: `invalid email "${email}"` });
        return;
      }
      if (identifier.length > 64) {
        errors.push({ row: lineNo, message: 'identifier too long (max 64)' });
        return;
      }
      if (fullName.length > 200) {
        errors.push({ row: lineNo, message: 'fullName too long (max 200)' });
        return;
      }
      if (seenIdentifiers.has(identifier)) {
        errors.push({ row: lineNo, message: `duplicate identifier "${identifier}" in file` });
        return;
      }
      if (seenEmails.has(email)) {
        errors.push({ row: lineNo, message: `duplicate email "${email}" in file` });
        return;
      }
      seenIdentifiers.add(identifier);
      seenEmails.add(email);
      toCreate.push({
        organizationId: orgId,
        identifier,
        fullName,
        email,
      });
    });

    if (toCreate.length > 0) {
      try {
        const result = await this.prisma.attendee.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
        created = result.count;
      } catch (err) {
        // createMany skipDuplicates is a no-op for P2002s but logs the count we got.
        // Surface as a generic error; per-row attribution is best-effort.
        throw new BadRequestException(`createMany failed: ${(err as Error).message}`);
      }
    }
    return { created, errors };
  }

  /**
   * Returns a map of attendeeId → { identifier, fullName, email } for the given ids.
   * Used by the CSV controller route to enrich setup-link rows.
   */
  async getAttendeeDetailsMap(
    orgId: string,
    attendeeIds: string[],
  ): Promise<Map<string, { identifier: string; fullName: string; email: string }>> {
    const rows = await this.prisma.attendee.findMany({
      where: { id: { in: attendeeIds }, organizationId: orgId },
      select: { id: true, identifier: true, fullName: true, email: true },
    });
    return new Map(rows.map((r) => [r.id, { identifier: r.identifier, fullName: r.fullName, email: r.email }]));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getSetupLinkTtl(): number {

    const raw = process.env['SETUP_LINK_TTL'];
    if (raw) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return 168; // 7 days default
  }
}
