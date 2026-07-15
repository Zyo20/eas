import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Papa from 'papaparse';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { CreateAttendeeRequest, UpdateAttendeeRequest } from '@eas/shared';

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

const PAGE_SIZE = 50;

@Injectable()
export class AttendeesService {
  constructor(private readonly prisma: PrismaService) {}

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
   * Returns the temporary password (v1 has no email service, so the admin
   * relays this to the attendee out-of-band). The attendee can change it
   * after first login in v1.1 (password-change flow not in v1).
   *
   * Throws ConflictException if the attendee already has an account, or if
   * the email is already taken by another user in this org.
   */
  async createAccount(
    orgId: string,
    attendeeId: string,
    email: string,
  ): Promise<{ attendeeId: string; userId: string; email: string; tempPassword: string }> {
    const attendee = await this.prisma.attendee.findFirst({
      where: { id: attendeeId, organizationId: orgId },
    });
    if (!attendee) throw new NotFoundException(`Attendee ${attendeeId} not found`);
    if (attendee.userId) {
      throw new ConflictException(
        `Attendee already has an account. Use POST /attendees/:id/reset-account to rotate the password.`,
      );
    }
    // Email must be unique across the User table (it's the login key).
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(`Email ${email} is already registered to a user`);
    }
    // Generate a 12-char temp password: a-zA-Z0-9, easy to read
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const user = await this.prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        passwordHash,
        name: attendee.fullName,
        role: UserRole.attendee,
      },
    });
    await this.prisma.attendee.update({
      where: { id: attendeeId },
      data: { userId: user.id },
    });
    return { attendeeId, userId: user.id, email, tempPassword };
  }

  /**
   * Reset the attendee's account password. Requires the attendee to already have
   * an account. Returns a new temp password. The old password is invalidated.
   * Useful for "I forgot my password" flows and post-incident rotation.
   */
  async resetAccount(
    orgId: string,
    attendeeId: string,
  ): Promise<{ attendeeId: string; userId: string; email: string; tempPassword: string }> {
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
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    return { attendeeId, userId: user.id, email: user.email, tempPassword };
  }

  /**
   * 12-char temp password: easy-to-read chars (no 0/O/1/l/I confusion).
   * Used by both createAccount and resetAccount. Not cryptographically strong —
   * v1 has no email service so the admin relays it out-of-band; the attendee
   * must change it on first login (v1.1).
   */
  private generateTempPassword(): string {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 12 }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');
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
}
