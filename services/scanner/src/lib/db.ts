import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type PendingScan = {
  idempotencyKey: string;
  eventId: string;
  jwt: string;
  scannedAt: string; // ISO
  scannerDeviceId: string;
  scannerLat?: number;
  scannerLng?: number;
  attempts: number;
  nextAttemptAt: number; // epoch ms
  enqueuedAt: number;
};

export type CachedRoster = {
  eventId: string;
  roster: RosterMember[];
  cachedAt: number;
};

export type RosterMember = {
  id: string;
  fullName: string;
  identifier: string;
  photoUrl?: string;
};

export type CachedEvent = {
  eventId: string;
  event: { id: string; name: string; location?: string; status: string };
  cachedAt: number;
};

export type ScanResult = {
  status: 'checked_in' | 'already_checked_in' | 'not_in_roster' | 'invalid_token' | 'event_closed';
  attendee?: { id: string; fullName: string };
  at: number;
};

interface EasDb extends DBSchema {
  pendingScans: {
    key: string; // idempotencyKey
    value: PendingScan;
    indexes: { 'by-event': string; 'by-next-attempt': number };
  };
  cachedRosters: {
    key: string; // eventId
    value: CachedRoster;
  };
  cachedEvents: {
    key: string; // eventId
    value: CachedEvent;
  };
  recentResults: {
    key: number; // timestamp
    value: ScanResult & { key: number };
  };
}

let dbPromise: Promise<IDBPDatabase<EasDb>> | null = null;
export function db(): Promise<IDBPDatabase<EasDb>> {
  if (!dbPromise) {
    dbPromise = openDB<EasDb>('eas-scanner', 1, {
      upgrade(d) {
        const ps = d.createObjectStore('pendingScans', { keyPath: 'idempotencyKey' });
        ps.createIndex('by-event', 'eventId');
        ps.createIndex('by-next-attempt', 'nextAttemptAt');
        d.createObjectStore('cachedRosters', { keyPath: 'eventId' });
        d.createObjectStore('cachedEvents', { keyPath: 'eventId' });
        d.createObjectStore('recentResults', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function enqueueScan(scan: PendingScan): Promise<void> {
  const d = await db();
  await d.put('pendingScans', scan);
}

export async function getPendingScans(eventId?: string): Promise<PendingScan[]> {
  const d = await db();
  if (eventId) {
    return d.getAllFromIndex('pendingScans', 'by-event', eventId);
  }
  return d.getAll('pendingScans');
}

export async function getDuePendingScans(now: number): Promise<PendingScan[]> {
  const d = await db();
  const tx = d.transaction('pendingScans', 'readwrite');
  const idx = tx.store.index('by-next-attempt');
  const all = await d.getAllFromIndex('pendingScans', 'by-next-attempt', IDBKeyRange.upperBound(now, true));
  // also pull anything with nextAttemptAt < now (we asked for <= now, then filter to past-only)
  return all.filter((s) => s.nextAttemptAt <= now);
}

export async function updateScan(scan: PendingScan): Promise<void> {
  const d = await db();
  await d.put('pendingScans', scan);
}

export async function removeScan(idempotencyKey: string): Promise<void> {
  const d = await db();
  await d.delete('pendingScans', idempotencyKey);
}

export async function cacheRoster(r: CachedRoster): Promise<void> {
  const d = await db();
  await d.put('cachedRosters', r);
}

export async function getCachedRoster(eventId: string): Promise<CachedRoster | undefined> {
  const d = await db();
  return d.get('cachedRosters', eventId);
}

export async function cacheEvent(e: CachedEvent): Promise<void> {
  const d = await db();
  await d.put('cachedEvents', e);
}

export async function getCachedEvent(eventId: string): Promise<CachedEvent | undefined> {
  const d = await db();
  return d.get('cachedEvents', eventId);
}

export async function pushRecent(r: ScanResult): Promise<void> {
  const d = await db();
  await d.put('recentResults', { ...r, key: r.at });
  // Keep only last 50
  const all = await d.getAll('recentResults');
  if (all.length > 50) {
    const sorted = all.sort((a, b) => a.key - b.key);
    const toDelete = sorted.slice(0, all.length - 50);
    const tx = d.transaction('recentResults', 'readwrite');
    for (const r of toDelete) await tx.store.delete(r.key);
    await tx.done;
  }
}

export async function getRecent(): Promise<(ScanResult & { key: number })[]> {
  const d = await db();
  return (await d.getAll('recentResults')).sort((a, b) => b.key - a.key).slice(0, 10);
}
