/**
 * Geolocation helper for the scanner PWA.
 *
 * Strategy:
 *   - On first scan, request navigator.geolocation (the browser prompts the
 *     user once per origin). Cache the coords in localStorage + a module-level
 *     variable.
 *   - If the user denies, or geolocation is unsupported, the cached value
 *     becomes `null` and the scanner attaches no coords to scan requests.
 *     Server will set `geofenceSkipped: true` on the record.
 *   - Coords are refreshed every 60s in the background so the scanner's
 *     location tracks its real position.
 *   - `scannerLat`/`scannerLng` are sent only if the timestamp is < 5 min
 *     old — otherwise the value is treated as stale and not sent (server
 *     treats absent coords as `geofenceSkipped: true`).
 */

const STORAGE_KEY = 'eas-scanner-geolocation';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const REFRESH_MS = 60 * 1000;     // 1 minute

export type ScannerLocation = {
  lat: number;
  lng: number;
  accuracyM?: number;
  capturedAt: number; // ms epoch
};

let cached: ScannerLocation | null = null;
let watchId: number | null = null;
let initialized = false;

type StoredShape = { lat: number; lng: number; accuracyM?: number; capturedAt: number } | null;

function load(): ScannerLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredShape;
    if (!parsed) return null;
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;
    if (Date.now() - parsed.capturedAt > MAX_AGE_MS) return null;
    return parsed as ScannerLocation;
  } catch {
    return null;
  }
}

function save(loc: ScannerLocation | null): void {
  if (typeof window === 'undefined') return;
  if (loc) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function getCachedLocation(): ScannerLocation | null {
  if (cached) return cached;
  cached = load();
  return cached;
}

/**
 * Request geolocation permission and start the background watcher.
 * Resolves immediately if already initialized.
 * Safe to call multiple times.
 */
export function initGeolocation(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  if (!('geolocation' in navigator)) {
    initialized = true;
    return;
  }
  initialized = true;

  const onSuccess = (pos: GeolocationPosition) => {
    cached = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
      capturedAt: Date.now(),
    };
    save(cached);
  };
  const onError = (err: GeolocationPositionError) => {
    // Permission denied / position unavailable / timeout. Don't spam the user.
    // The scanner will fall back to sending no coords.
    console.warn('[geolocation] error', err.code, err.message);
  };

  navigator.geolocation.getCurrentPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 0,
  });

  // Watcher
  if (watchId === null) {
    watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 30_000,
      maximumAge: REFRESH_MS,
    });
  }
}
