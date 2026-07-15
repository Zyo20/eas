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
    throw new ApiError(res.status, parsed, `HTTP ${res.status}`);
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
