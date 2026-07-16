'use client';

const API_BASE = '/api/v1';

let token: string | null = null;

export function setToken(t: string | null) {
  token = t;
  if (typeof window !== 'undefined') {
    if (t) localStorage.setItem('eas-token', t);
    else localStorage.removeItem('eas-token');
  }
}

export function getToken(): string | null {
  if (token) return token;
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('eas-token');
  }
  return token;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

async function http<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* leave as text */ }
    const message =
      parsed && typeof parsed === 'object' && 'message' in parsed && typeof (parsed as Record<string, unknown>).message === 'string'
        ? (parsed as Record<string, unknown>).message as string
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, parsed, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => http<T>('GET', path),
  post: <T>(path: string, body?: unknown) => http<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => http<T>('PATCH', path, body),
  del:  <T>(path: string) => http<T>('DELETE', path),
  /**
   * Fetch a binary/blob response with auth, then trigger a browser download.
   * Use for PDF, SVG, PNG, etc. that need Authorization headers — a plain
   * <a href> won't carry headers on a top-level navigation, and the Next.js
   * rewrite proxy doesn't forward Authorization either.
   */
  async download(path: string, filename: string): Promise<void> {
    const headers: Record<string, string> = {};
    const t = getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text, `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
};

export type Attendee = {
  id: string;
  identifier: string;
  fullName: string;
  email?: string | null;
  hasAccount: boolean; // true if a User account is linked
};


export type Event = {
  id: string;
  name: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  organizationId: string;
  // Geofence (optional). When both lat and lng are set, scans outside the radius
  // (in meters) are flagged. When either is null, geofence is disabled and scans
  // go through with geofenceSkipped: true.
  locationLat?: number | null;
  locationLng?: number | null;
  geofenceRadiusM?: number;
};

export type AttendanceRecord = {
  id: string;
  attendeeId: string;
  scannedAt: string;
  source: 'SCAN' | 'MANUAL' | 'IMPORT';
  attendee: { id: string; identifier: string; fullName: string };
  note?: string | null;
};

export type Summary = {
  total: number;
  checkedIn: number;
  remaining: number;
  percent: number;
};

export type FlaggedRecord = {
  id: string;
  source: 'SCAN' | 'MANUAL' | 'IMPORT';
  createdAt: string;
  scannedAt: string;
  eventId: string;
  attendeeId: string;
  outsideGeofence: boolean;
  distanceM: number | null;
  geofenceSkipped: boolean;
  attendee: { id: string; identifier: string; fullName: string };
};

export type FlaggedCount = { eventId: string; flaggedCount: number };

// ---- v1.1.1: Setup-link types ----

export type SetupLinkEntry = {
  attendeeId: string;
  email: string;
  setupUrl: string;
  /**
   * True if the setup email was delivered. False if SMTP failed (rate
   * limit, network blip) — the setupUrl is still in the response so the
   * admin can copy/paste it manually.
   */
  emailSent: boolean;
  /** If the email send failed, the SMTP error message. */
  emailError?: string;
};

export type BulkSkipReason = 'already_has_account' | 'missing_email' | 'email_taken' | 'not_found';

export type BulkSkippedEntry = {
  attendeeId: string;
  reason: BulkSkipReason;
};

export type BulkCreateAccountsResponse = {
  created: SetupLinkEntry[];
  skipped: BulkSkippedEntry[];
  summary: { requested: number; created: number; skipped: number; emailFailures: number };
};

// ---- v1.1.x: Bulk soft-delete ----

export type BulkDeletedEntry = {
  attendeeId: string;
  identifier: string;
  fullName: string;
  deletedAt: string;
};

export type BulkDeleteSkipReason = 'not_found' | 'already_deleted';

export type BulkDeleteResponse = {
  deleted: BulkDeletedEntry[];
  skipped: { attendeeId: string; reason: BulkDeleteSkipReason }[];
  summary: { requested: number; deleted: number; skipped: number };
};

export type SetupInfoResponse = {
  email: string;
  name: string;
};

// ---- v1.1.1: API helpers ----

/**
 * Bulk create attendee accounts. Returns setupUrls for successful entries.
 */
export async function bulkCreateAccounts(
  orgId: string,
  attendeeIds: string[],
  expiresInHours?: number,
): Promise<BulkCreateAccountsResponse> {
  return api.post<BulkCreateAccountsResponse>(`/orgs/${orgId}/attendees/bulk-create-accounts`, {
    attendeeIds,
    ...(expiresInHours !== undefined ? { expiresInHours } : {}),
  });
}

/**
 * Bulk soft-delete attendees. Returns the deleted entries and any skipped
 * (not_found or already_deleted) so the UI can show partial success.
 */
export async function bulkDeleteAttendees(
  orgId: string,
  attendeeIds: string[],
): Promise<BulkDeleteResponse> {
  return api.post<BulkDeleteResponse>(`/orgs/${orgId}/attendees/bulk-delete`, {
    attendeeIds,
  });
}

/**
 * Soft-delete every active User in the org that's orphaned (linked to a
 * soft-deleted Attendee, or not linked to any Attendee). Returns the cleaned
 * list and a summary. Frees up emails that are stuck behind stale accounts.
 */
export type CleanupOrphanResult = {
  cleaned: { userId: string; email: string; reason: 'linked_to_deleted_attendee' }[];
  summary: { requested: number; cleaned: number };
};

export async function cleanupOrphanUsers(orgId: string): Promise<CleanupOrphanResult> {
  return api.post<CleanupOrphanResult>(`/orgs/${orgId}/cleanup-orphan-users`, {});
}

/**
 * Peek at a setup token without consuming it.
 * Returns the user's name + email for the welcome page.
 */
export async function getSetupInfo(token: string): Promise<SetupInfoResponse> {
  return api.get<SetupInfoResponse>(`/auth/setup-info?token=${encodeURIComponent(token)}`);
}

/**
 * Consume a setup token and set a new password.
 * Returns the updated user on success. Throws 410 if already consumed.
 */
export async function consumeSetupToken(
  token: string,
  newPassword: string,
): Promise<{ id: string; email: string; name: string; role: string; organizationId: string }> {
  return api.post(`/auth/setup-account`, { token, newPassword });
}

