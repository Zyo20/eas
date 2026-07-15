// Domain types that are NOT request/response DTOs.
// These are the canonical entity shapes used across services.

export type Uuid = string;

export type Organization = {
  id: Uuid;
  name: string;
  slug: string;
  type: 'SCHOOL' | 'ORG';
  createdAt: string;
  deletedAt: string | null;
};

export type User = {
  id: Uuid;
  organizationId: Uuid;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

export type Attendee = {
  id: Uuid;
  organizationId: Uuid;
  identifier: string;
  fullName: string;
  email: string | null;
  qrSecret: Uuid;
  photoUrl: string | null;
  createdAt: string;
};

export type Event = {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  createdById: Uuid;
  createdAt: string;
  deletedAt: string | null;
};

export type AttendanceRecord = {
  id: Uuid;
  eventId: Uuid;
  attendeeId: Uuid;
  idempotencyKey: Uuid;
  scannedAt: string;
  createdAt: string;
  source: 'SCAN' | 'MANUAL' | 'IMPORT';
  scannerLat: number | null;
  scannerLng: number | null;
  scannerDeviceId: string | null;
  note: string | null;
};

/**
 * The shape returned by `GET /api/v1/events/:eventId/scanner-bootstrap`.
 * Truncated roster — no secrets, no PII beyond name + identifier.
 */
export type ScannerBootstrap = {
  event: Event;
  roster: Array<Pick<Attendee, 'id' | 'fullName' | 'identifier' | 'photoUrl'>>;
  attendanceSummary: {
    total: number;
    checkedIn: number;
    remaining: number;
    percent: number;
  };
};
