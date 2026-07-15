import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventRequest, UpdateEventRequest } from '@eas/shared';

export type EventDto = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  createdById: string;
  createdAt: string;
  deletedAt: string | null;
  // Geofence
  locationLat: number | null;
  locationLng: number | null;
  geofenceRadiusM: number;
  attendeeCount?: number;
};

function toDto(e: {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  createdById: string;
  createdAt: Date;
  deletedAt: Date | null;
  locationLat: { toNumber(): number } | null;
  locationLng: { toNumber(): number } | null;
  geofenceRadiusM: number;
  _count?: { rosters: number };
}): EventDto {
  return {
    id: e.id,
    organizationId: e.organizationId,
    name: e.name,
    description: e.description,
    location: e.location,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    status: e.status,
    createdById: e.createdById,
    createdAt: e.createdAt.toISOString(),
    deletedAt: e.deletedAt ? e.deletedAt.toISOString() : null,
    locationLat: e.locationLat ? e.locationLat.toNumber() : null,
    locationLng: e.locationLng ? e.locationLng.toNumber() : null,
    geofenceRadiusM: e.geofenceRadiusM,
    attendeeCount: e._count?.rosters,
  };
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOrg(orgId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
    });
    if (!org) throw new NotFoundException(`Organization ${orgId} not found`);
    return org;
  }

  async create(
    orgId: string,
    createdById: string,
    body: CreateEventRequest,
  ): Promise<EventDto> {
    await this.assertOrg(orgId);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt <= startsAt) {
      throw new (await import('@nestjs/common')).BadRequestException('endsAt must be after startsAt');
    }
    // Geofence validation: lat/lng must be paired (both or neither).
    const { locationLat, locationLng, geofenceRadiusM } = parseGeofence({
      locationLat: body.locationLat,
      locationLng: body.locationLng,
      geofenceRadiusM: body.geofenceRadiusM,
    });
    const event = await this.prisma.$transaction(async (tx) => {
      const e = await tx.event.create({
        data: {
          organizationId: orgId,
          name: body.name,
          description: body.description ?? null,
          location: body.location ?? null,
          startsAt,
          endsAt,
          status: body.status ?? 'DRAFT',
          createdById,
          locationLat,
          locationLng,
          geofenceRadiusM,
        },
      });
      if (body.attendeeIds.length > 0) {
        // De-dupe + filter to known org attendees (defense in depth).
        const valid = await tx.attendee.findMany({
          where: { id: { in: body.attendeeIds }, organizationId: orgId },
          select: { id: true },
        });
        if (valid.length > 0) {
          await tx.eventRoster.createMany({
            data: valid.map((a) => ({ eventId: e.id, attendeeId: a.id })),
          });
        }
      }
      return tx.event.findUniqueOrThrow({
        where: { id: e.id },
        include: { _count: { select: { rosters: true } } },
      });
    });
    return toDto(event);
  }

  async list(
    orgId: string,
    filters: { status?: 'DRAFT' | 'OPEN' | 'CLOSED'; from?: string; to?: string },
  ): Promise<{ data: EventDto[] }> {
    await this.assertOrg(orgId);
    const items = await this.prisma.event.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from || filters.to
          ? {
              startsAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      include: { _count: { select: { rosters: true } } },
      orderBy: { startsAt: 'desc' },
    });
    return { data: items.map(toDto) };
  }

  async get(orgId: string, id: string): Promise<EventDto> {
    const e = await this.prisma.event.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { _count: { select: { rosters: true } } },
    });
    if (!e) throw new NotFoundException(`Event ${id} not found`);
    return toDto(e);
  }

  async update(orgId: string, id: string, body: UpdateEventRequest): Promise<EventDto> {
    const existing = await this.prisma.event.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException(`Event ${id} not found`);
    // If user touches any of the geofence fields, validate the trio together.
    let geofencePatch: { locationLat?: number | null; locationLng?: number | null; geofenceRadiusM?: number } = {};
    if (
      body.locationLat !== undefined ||
      body.locationLng !== undefined ||
      body.geofenceRadiusM !== undefined
    ) {
      const parsed = parseGeofence({
        locationLat: body.locationLat !== undefined ? body.locationLat : existing.locationLat?.toNumber() ?? null,
        locationLng: body.locationLng !== undefined ? body.locationLng : existing.locationLng?.toNumber() ?? null,
        geofenceRadiusM: body.geofenceRadiusM !== undefined ? body.geofenceRadiusM : existing.geofenceRadiusM,
      });
      geofencePatch = {
        ...(body.locationLat !== undefined ? { locationLat: parsed.locationLat } : {}),
        ...(body.locationLng !== undefined ? { locationLng: parsed.locationLng } : {}),
        ...(body.geofenceRadiusM !== undefined ? { geofenceRadiusM: parsed.geofenceRadiusM } : {}),
      };
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.startsAt !== undefined ? { startsAt: new Date(body.startsAt) } : {}),
        ...(body.endsAt !== undefined ? { endsAt: new Date(body.endsAt) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...geofencePatch,
      },
      include: { _count: { select: { rosters: true } } },
    });
    return toDto(updated);
  }

  async close(orgId: string, id: string): Promise<EventDto> {
    return this.update(orgId, id, { status: 'CLOSED' });
  }

  async softDelete(orgId: string, id: string): Promise<{ id: string }> {
    const existing = await this.prisma.event.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException(`Event ${id} not found`);
    await this.prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  async setRoster(
    orgId: string,
    eventId: string,
    attendeeIds: string[],
  ): Promise<{ eventId: string; attendeeIds: string[] }> {
    const e = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId, deletedAt: null },
    });
    if (!e) throw new NotFoundException(`Event ${eventId} not found`);
    const valid = await this.prisma.attendee.findMany({
      where: { id: { in: attendeeIds }, organizationId: orgId },
      select: { id: true },
    });
    const validIds = valid.map((a) => a.id);
    await this.prisma.$transaction([
      this.prisma.eventRoster.deleteMany({ where: { eventId } }),
      ...(validIds.length > 0
        ? [
            this.prisma.eventRoster.createMany({
              data: validIds.map((aid) => ({ eventId, attendeeId: aid })),
            }),
          ]
        : []),
    ]);
    return { eventId, attendeeIds: validIds };
  }

  async getRosterCsv(orgId: string, eventId: string): Promise<string> {
    const e = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId, deletedAt: null },
      include: {
        rosters: {
          include: { attendee: { select: { identifier: true, fullName: true, email: true } } },
          orderBy: { attendee: { identifier: 'asc' } },
        },
      },
    });
    if (!e) throw new NotFoundException(`Event ${eventId} not found`);
    const lines = ['identifier,fullName,email'];
    for (const r of e.rosters) {
      const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      lines.push([esc(r.attendee.identifier), esc(r.attendee.fullName), esc(r.attendee.email)].join(','));
    }
    return lines.join('\n') + '\n';
  }
}

/**
 * Validate + normalize a geofence triple.
 * Rules:
 *   - locationLat/lng must BOTH be set or BOTH be null
 *   - if both set, lat must be in [-90, 90], lng in [-180, 180]
 *   - geofenceRadiusM must be a positive integer (default 50)
 * Returns the values ready to write to the DB.
 */
function parseGeofence(input: {
  locationLat: number | null | undefined;
  locationLng: number | null | undefined;
  geofenceRadiusM: number | undefined;
}): { locationLat: number | null; locationLng: number | null; geofenceRadiusM: number } {
  const { locationLat, locationLng, geofenceRadiusM } = input;
  const latProvided = locationLat !== null && locationLat !== undefined;
  const lngProvided = locationLng !== null && locationLng !== undefined;
  if (latProvided !== lngProvided) {
    throw new BadRequestException('locationLat and locationLng must both be set or both be null');
  }
  if (latProvided) {
    if (locationLat! < -90 || locationLat! > 90) {
      throw new BadRequestException('locationLat must be in [-90, 90]');
    }
    if (locationLng! < -180 || locationLng! > 180) {
      throw new BadRequestException('locationLng must be in [-180, 180]');
    }
  }
  if (geofenceRadiusM !== undefined && (!Number.isInteger(geofenceRadiusM) || geofenceRadiusM < 1)) {
    throw new BadRequestException('geofenceRadiusM must be a positive integer');
  }
  return {
    locationLat: latProvided ? locationLat! : null,
    locationLng: lngProvided ? locationLng! : null,
    geofenceRadiusM: geofenceRadiusM ?? 50,
  };
}
