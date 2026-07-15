import { z } from 'zod';

// ---- Enums (mirror prisma enums; keep these in lockstep) ----

export const OrgTypeSchema = z.enum(['SCHOOL', 'ORG']);
export type OrgType = z.infer<typeof OrgTypeSchema>;

export const EventStatusSchema = z.enum(['DRAFT', 'OPEN', 'CLOSED']);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export const AttendanceSourceSchema = z.enum(['SCAN', 'MANUAL', 'IMPORT']);
export type AttendanceSource = z.infer<typeof AttendanceSourceSchema>;

// ---- Auth ----

export const LoginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    role: z.string(),
    organizationId: z.string().uuid(),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// ---- Attendee ----

export const CreateAttendeeRequestSchema = z.object({
  identifier: z.string().min(1).max(64),
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(254),
});
export type CreateAttendeeRequest = z.infer<typeof CreateAttendeeRequestSchema>;

export const UpdateAttendeeRequestSchema = CreateAttendeeRequestSchema.partial();
export type UpdateAttendeeRequest = z.infer<typeof UpdateAttendeeRequestSchema>;

// ---- Event ----

export const CreateEventRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  attendeeIds: z.array(z.string().uuid()).default([]),
  locationLat: z.number().min(-90).max(90).optional().nullable(),
  locationLng: z.number().min(-180).max(180).optional().nullable(),
  geofenceRadiusM: z.number().int().min(1).max(10000).optional(),
});
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;

export const UpdateEventRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    status: EventStatusSchema.optional(),
    locationLat: z.number().min(-90).max(90).nullable().optional(),
    locationLng: z.number().min(-180).max(180).nullable().optional(),
    geofenceRadiusM: z.number().int().min(1).max(10000).optional(),
  })
  .refine(
    (v) => Object.keys(v).length > 0,
    { message: 'At least one field must be provided' },
  );
export type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>;

// ---- Attendance (the scan endpoint) ----

/**
 * The five status responses from the scan endpoint — per spec §4.
 * The string literal values are part of the contract.
 */
export const AttendanceStatusSchema = z.enum([
  'checked_in',
  'already_checked_in',
  'not_in_roster',
  'invalid_token',
  'event_closed',
]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const AttendancePostRequestSchema = z.object({
  eventId: z.string().uuid(),
  jwt: z.string().min(10),
  scannedAt: z.string().datetime(),
  scannerDeviceId: z.string().min(1).max(200),
  scannerLat: z.number().min(-90).max(90).optional().nullable(),
  scannerLng: z.number().min(-180).max(180).optional().nullable(),
  idempotencyKey: z.string().uuid(),
});
export type AttendancePostRequest = z.infer<typeof AttendancePostRequestSchema>;

export const AttendancePostResponseSchema = z.object({
  status: AttendanceStatusSchema,
  attendee: z
    .object({
      id: z.string().uuid(),
      fullName: z.string(),
      identifier: z.string(),
    })
    .optional(),
  recordId: z.string().uuid().optional(),
});
export type AttendancePostResponse = z.infer<typeof AttendancePostResponseSchema>;

export const ManualCheckInRequestSchema = z.object({
  attendeeId: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
});
export type ManualCheckInRequest = z.infer<typeof ManualCheckInRequestSchema>;
