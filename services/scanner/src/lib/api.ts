import type { PendingScan, ScanResult, CachedRoster, RosterMember, CachedEvent } from './db';
import { enqueueScan, getDuePendingScans, removeScan, updateScan, pushRecent, cacheRoster, cacheEvent } from './db';
import { v4 as uuidv4 } from 'uuid';
import { getCachedLocation, initGeolocation } from './geolocation';

// API base. In dev, vite proxies /api → :4000. In prod, scanner is served
// behind the same Caddy vhost as the API so a relative path works.
const API_BASE = '/api/v1';

export type BootstrapResponse = {
  event: { id: string; name: string; location?: string; status: string; startsAt: string; endsAt: string };
  roster: RosterMember[];
};

let deviceId: string | null = null;
function getDeviceId(): string {
  if (deviceId) return deviceId;
  const KEY = 'eas-scanner-deviceId';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `scanner-${uuidv4().slice(0, 8)}`;
    localStorage.setItem(KEY, id);
  }
  deviceId = id;
  return id;
}

export async function fetchBootstrap(eventId: string): Promise<BootstrapResponse> {
  const res = await fetch(`${API_BASE}/events/${eventId}/scanner-bootstrap`, {
    headers: { 'X-Scanner-Device': getDeviceId() },
  });
  if (!res.ok) {
    throw new Error(`bootstrap failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function bootstrapAndCache(eventId: string): Promise<BootstrapResponse> {
  const data = await fetchBootstrap(eventId);
  const now = Date.now();
  await cacheRoster({ eventId, roster: data.roster, cachedAt: now });
  await cacheEvent({ eventId, event: data.event, cachedAt: now });
  return data;
}

export type ScanRequest = {
  eventId: string;
  jwt: string;
  scannedAt: string;
  scannerDeviceId: string;
  idempotencyKey: string;
  scannerLat?: number;
  scannerLng?: number;
};

async function postAttendance(req: ScanRequest): Promise<ScanResult> {
  const res = await fetch(`${API_BASE}/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok && res.status !== 200 && res.status !== 201) {
    throw new Error(`scan failed: ${res.status}`);
  }
  const body = await res.json();
  return {
    status: body.status,
    attendee: body.attendee,
    at: Date.now(),
  };
}

function backoffMs(attempts: number): number {
  // 1s, 2s, 4s, 8s, ... capped at 60s
  return Math.min(60_000, 1000 * 2 ** attempts);
}

export async function recordScan(args: {
  eventId: string;
  jwt: string;
  roster: RosterMember[];
}): Promise<ScanResult> {
  const idempotencyKey = uuidv4();
  // Request geolocation permission on the first scan, attach cached coords if available.
  initGeolocation();
  const loc = getCachedLocation();
  const scan: ScanRequest = {
    eventId: args.eventId,
    jwt: args.jwt,
    scannedAt: new Date().toISOString(),
    scannerDeviceId: getDeviceId(),
    idempotencyKey,
    ...(loc ? { scannerLat: loc.lat, scannerLng: loc.lng } : {}),
  };

  // Optimistic match against cached roster (for instant feedback even if offline)
  const expected = parseJwtAid(args.jwt);
  const expectedMember = expected ? args.roster.find((r) => r.id === expected.aid) : undefined;
  const isOnRoster = Boolean(expectedMember);

  if (navigator.onLine) {
    try {
      const result = await postAttendance(scan);
      await pushRecent(result);
      return result;
    } catch (err) {
      // Fall through to enqueue
      console.warn('online scan failed, queuing', err);
    }
  }

  // Offline path: enqueue
  const pending: PendingScan = {
    idempotencyKey,
    eventId: scan.eventId,
    jwt: scan.jwt,
    scannedAt: scan.scannedAt,
    scannerDeviceId: scan.scannerDeviceId,
    scannerLat: scan.scannerLat,
    scannerLng: scan.scannerLng,
    attempts: 0,
    nextAttemptAt: Date.now() + backoffMs(0),
    enqueuedAt: Date.now(),
  };
  await enqueueScan(pending);

  // Optimistic local result for the UI:
  //   - on roster + valid JWT shape → "checked_in (queued)"
  //   - not on roster → "not_in_roster (queued)"
  //   - bogus JWT → "invalid_token (queued)"
  const optimistic: ScanResult = {
    status: expected ? (isOnRoster ? 'checked_in' : 'not_in_roster') : 'invalid_token',
    attendee: expectedMember,
    at: Date.now(),
  };
  await pushRecent(optimistic);
  return optimistic;
}

type JwtAid = { aid?: string; eid?: string; exp?: number };
function parseJwtAid(jwt: string): JwtAid | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payloadPart = parts[1] ?? '';
    const padded = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
    const json = atob(pad);
    return JSON.parse(json) as JwtAid;
  } catch {
    return null;
  }
}

let replaying = false;
export async function replayQueue(): Promise<{ attempted: number; succeeded: number; failed: number }> {
  if (replaying) return { attempted: 0, succeeded: 0, failed: 0 };
  if (!navigator.onLine) return { attempted: 0, succeeded: 0, failed: 0 };
  replaying = true;
  let attempted = 0, succeeded = 0, failed = 0;
  try {
    const due = await getDuePendingScans(Date.now());
    for (const scan of due) {
      attempted++;
      try {
        const result = await postAttendance({
          eventId: scan.eventId,
          jwt: scan.jwt,
          scannedAt: scan.scannedAt,
          scannerDeviceId: scan.scannerDeviceId,
          idempotencyKey: scan.idempotencyKey,
          scannerLat: scan.scannerLat,
          scannerLng: scan.scannerLng,
        });
        await pushRecent(result);
        await removeScan(scan.idempotencyKey);
        succeeded++;
      } catch (err) {
        scan.attempts++;
        scan.nextAttemptAt = Date.now() + backoffMs(scan.attempts);
        await updateScan(scan);
        failed++;
      }
    }
  } finally {
    replaying = false;
  }
  return { attempted, succeeded, failed };
}

// Watch network status; replay when we come back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void replayQueue();
  });
  // Also a periodic safety net (every 15s when online, even if no events)
  setInterval(() => {
    if (navigator.onLine) void replayQueue();
  }, 15_000);
}
