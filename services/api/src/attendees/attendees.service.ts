import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Papa from 'papaparse';
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
};

export type CsvImportError = { row: number; message: string };
export type CsvImportResult = { created: number; errors: CsvImportError[] };

export type BulkCreatedEntry = {
  attendeeId: string;
  email: string;
  setupUrl: string;
};

export type BulkSkipReason = 'already_has_account' | 'missing_email' | 'email_taken' | 'not_found';

export type BulkSkippedEntry = {
  attendeeId: string;
  reason: BulkSkipReason;
};

export type BulkCreateAccountsResult = {
  created: BulkCreatedEntry[];
  skipped: BulkSkippedEntry[];
  summary: { requested: number; created: number; skipped: number };
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
   * Throws ConflictException if the attendee already has an account, or if the email is taken.
   */
  async createAccount(
    orgId: string,
    attendeeId: string,
    email: string,
  ): Promise<{ attendeeId: string; userId: string; email: string; setupUrl: string }> {
    const attendee = await this.prisma.attendee.findFirst({
      where: { id: attendeeId, organizationId: orgId },
    });
    if (!attendee) throw new NotFoundException(`Attendee ${attendeeId} not found`);
    if (attendee.userId) {
      throw new ConflictException(
        `Attendee already has an account. Use POST /attendees/:id/reset-account to issue a new setup link.`,
      );
    }
    // Email must be unique across the User table (it's the login key).
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(`Email ${email} is already registered to a user`);
    }

    // Create User with a dummy passwordHash — they'll set the real password via the setup link.
    // We use an empty bcrypt hash that can never match any real password input.
    const user = await this.prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        passwordHash: '*', // placeholder; will be replaced when setup link is consumed
        name: attendee.fullName,
        role: UserRole.attendee,
      },
    });
    await this.prisma.attendee.update({
      where: { id: attendeeId },
      data: { userId: user.id },
    });

    const ttlHours = Number(this.getSetupLinkTtl());
    const token = await this.setupTokenSvc.signSetupToken(user.id, ttlHours);
    const setupUrl = this.setupTokenSvc.buildSetupUrl(token);

    // Send magic setup link email to the attendee
    await this.mailService.sendSetupEmail(email, attendee.fullName, setupUrl, ttlHours);

    return { attendeeId, userId: user.id, email, setupUrl };
  }

  /**
   * Reset the attendee's account — issues a new setup link.
   * The attendee's current password is invalidated until they consume the new link.
   */
  async resetAccount(
    orgId: string,
    attendeeId: string,
  ): Promise<{ attendeeId: string; userId: string; email: string; setupUrl: string }> {
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

    const ttlHours = Number(this.getSetupLinkTtl());
    const token = await this.setupTokenSvc.signSetupToken(user.id, ttlHours);
    const setupUrl = this.setupTokenSvc.buildSetupUrl(token);

    // Send magic setup link email to the attendee
    await this.mailService.sendSetupEmail(user.email, attendee.fullName, setupUrl, ttlHours);

    return { attendeeId, userId: user.id, email: user.email, setupUrl };
  }

  /**
   * Bulk create User accounts for a list of attendees.
   * Partial-success: attendees that fail (already has account, missing email, etc.)
   * are reported in `skipped`. Successfully provisioned ones are in `created`.
   * Max 100 attendeeIds per call (enforced by the controller/DTO).
   */
  async bulkCreateAccounts(
    orgId: string,
    attendeeIds: string[],
    expiresInHours = 168,
  ): Promise<BulkCreateAccountsResult> {
    // Fetch all requested attendees in one query
    const found = await this.prisma.attendee.findMany({
      where: { id: { in: attendeeIds }, organizationId: orgId },
    });
    const foundMap = new Map(found.map((a) => [a.id, a]));

    // Check which emails are already taken by any User
    const emailsToCheck = found
      .filter((a) => a.email && !a.userId)
      .map((a) => a.email);
    const takenUsers = emailsToCheck.length
      ? await this.prisma.user.findMany({
          where: { email: { in: emailsToCheck } },
          select: { email: true },
        })
      : [];
    const takenEmails = new Set(takenUsers.map((u) => u.email));

    const created: BulkCreatedEntry[] = [];
    const skipped: BulkSkippedEntry[] = [];

    for (const attendeeId of attendeeIds) {
      const attendee = foundMap.get(attendeeId);
      if (!attendee) {
        skipped.push({ attendeeId, reason: 'not_found' });
        continue;
      }
      if (attendee.userId) {
        skipped.push({ attendeeId, reason: 'already_has_account' });
        continue;
      }
      if (!attendee.email) {
        skipped.push({ attendeeId, reason: 'missing_email' });
        continue;
      }
      if (takenEmails.has(attendee.email)) {
        skipped.push({ attendeeId, reason: 'email_taken' });
        continue;
      }

      // Create User + link Attendee atomically
      try {
        const user = await this.prisma.$transaction(async (tx) => {
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

        // Send magic setup link email to the attendee
        await this.mailService.sendSetupEmail(attendee.email!, attendee.fullName, setupUrl, expiresInHours);

        created.push({ attendeeId, email: attendee.email!, setupUrl });
        // Mark the email as now taken so duplicate emails in the same batch are caught
        takenEmails.add(attendee.email!);
      } catch (err) {
        // Rare race condition (e.g. email taken between the pre-check and create)
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
      where: { id, organizationId: orgId },
    });
    if (!a) throw new NotFoundException(`Attendee ${id} not found`);
    return this.toDto(a);
  }

  async update(orgId: string, id: string, body: UpdateAttendeeRequest): Promise<AttendeeDto> {
    const existing = await this.prisma.attendee.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException(`Attendee ${id} not found`);
    const updated = await this.prisma.attendee.update({
      where: { id },
      data: {
        ...(body.identifier !== undefined ? { identifier: body.identifier } : {}),
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
      },
    });
    return this.toDto(updated);
  }

  async regenerateQr(orgId: string, id: string): Promise<AttendeeDto> {
    const existing = await this.prisma.attendee.findFirst({
      where: { id, organizationId: orgId },
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
      }>
    >`UPDATE "Attendee" SET "qrSecret" = gen_random_uuid() WHERE id = ${id}::uuid RETURNING *`;
    const row = updated[0];
    if (!row) throw new NotFoundException('Attendee disappeared after QR rotation');
    return this.toDto(row);
  }

  async remove(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.prisma.attendee.findFirst({
      where: { id, organizationId: orgId },
      include: { _count: { select: { records: true } } },
    });
    if (!existing) throw new NotFoundException(`Attendee ${id} not found`);
    if (existing._count.records > 0) {
      throw new ConflictException(
        `Attendee has ${existing._count.records} attendance record(s). ` +
          `Hard-delete is blocked. Use soft-delete (coming in v1.1) or remove the records first.`,
      );
    }
    await this.prisma.attendee.delete({ where: { id } });
    return { id };
  }

  /**
   * Bulk import via CSV.
   * Expected columns: identifier, fullName, email (header row required).
   * Email is REQUIRED (needed for account creation).
   * Per §4: returns { created, errors }. Malformed rows are reported, not fatal.
   */
  async importCsv(orgId: string, csvText: string): Promise<CsvImportResult> {
    await this.assertOrgExists(orgId);
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
    const rows = parsed.data;
    if (rows.length === 0) {
      throw new BadRequestException('CSV has no data rows');
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
        errors.push({ row: lineNo, message: `duplicate identifier "${identifier}" in CSV` });
        return;
      }
      if (seenEmails.has(email)) {
        errors.push({ row: lineNo, message: `duplicate email "${email}" in CSV` });
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
