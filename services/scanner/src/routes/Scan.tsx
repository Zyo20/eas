import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CameraScanner } from '../lib/scanner';
import { bootstrapAndCache, recordScan, replayQueue } from '../lib/api';
import {
  getCachedRoster,
  getCachedEvent,
  getPendingScans,
  getRecent,
  type RosterMember,
  type ScanResult,
} from '../lib/db';

const STATUS_COLOR: Record<ScanResult['status'], string> = {
  checked_in: '#16a34a',
  already_checked_in: '#ca8a04',
  not_in_roster: '#dc2626',
  invalid_token: '#dc2626',
  event_closed: '#7c3aed',
};

const STATUS_LABEL: Record<ScanResult['status'], string> = {
  checked_in: 'Checked in',
  already_checked_in: 'Already checked in',
  not_in_roster: 'Not on roster',
  invalid_token: 'Invalid QR',
  event_closed: 'Event closed',
};

function extractJwt(scanned: string): string | null {
  // QR encodes: https://host/check-in/:eventId?t=<jwt>
  // or sometimes just the raw JWT (e.g. dev mode / badge testing)
  if (!scanned) return null;
  if (scanned.startsWith('eyJ')) return scanned;
  try {
    const u = new URL(scanned);
    const t = u.searchParams.get('t');
    if (t) return t;
  } catch {
    // not a URL
  }
  return null;
}

export default function Scan() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<CameraScanner | null>(null);

  const [event, setEvent] = useState<{ id: string; name: string; location?: string; status: string } | null>(null);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [summary, setSummary] = useState<{ total: number; checkedIn: number; remaining: number; percent: number } | null>(null);
  const [queueDepth, setQueueDepth] = useState(0);
  const [recent, setRecent] = useState<(ScanResult & { key: number })[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState('');
  const [flash, setFlash] = useState<{ color: string; label: string; attendee?: string; at: number } | null>(null);

  // Initial bootstrap (network) + cached fallback
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      // try network first
      try {
        const data = await bootstrapAndCache(eventId);
        setEvent(data.event);
        setRoster(data.roster);
        return;
      } catch (err) {
        console.warn('network bootstrap failed, falling back to cache', err);
      }
      // fallback: cache
      const cached = await getCachedRoster(eventId);
      const cachedEvent = await getCachedEvent(eventId);
      if (cached) setRoster(cached.roster);
      if (cachedEvent) setEvent(cachedEvent.event);
    })();
  }, [eventId]);

  // Poll summary + queue depth + recent
  const refreshState = useCallback(async () => {
    if (!eventId) return;
    try {
      const [q, r] = await Promise.all([getPendingScans(eventId), getRecent()]);
      setQueueDepth(q.length);
      setRecent(r);
    } catch (err) {
      console.warn('refresh failed', err);
    }
    if (navigator.onLine) {
      try {
        const res = await fetch(`/api/v1/events/${eventId}/attendance/summary`);
        if (res.ok) setSummary(await res.json());
      } catch {
        // ignore
      }
    }
  }, [eventId]);

  useEffect(() => {
    void refreshState();
    const t = setInterval(() => void refreshState(), 3000);
    return () => clearInterval(t);
  }, [refreshState]);

  // Network status listeners
  useEffect(() => {
    const onUp = () => {
      setOnline(true);
      void replayQueue().then(() => void refreshState());
    };
    const onDown = () => setOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, [refreshState]);

  // Camera start
  useEffect(() => {
    if (!videoRef.current) return;
    const scanner = new CameraScanner();
    scannerRef.current = scanner;
    setCameraError(null);
    scanner
      .start(videoRef.current, onQrScanned, (err) => setCameraError(err.message))
      .catch((err) => setCameraError(err instanceof Error ? err.message : String(err)));
    return () => scanner.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFlash = (status: ScanResult['status'], attendee?: RosterMember) => {
    setFlash({
      color: STATUS_COLOR[status],
      label: STATUS_LABEL[status],
      attendee: attendee?.fullName,
      at: Date.now(),
    });
    // vibrate if supported
    if (navigator.vibrate) {
      const pattern = status === 'checked_in' ? [30] : status === 'already_checked_in' ? [15, 30, 15] : [60];
      navigator.vibrate(pattern);
    }
    setTimeout(() => setFlash(null), 1500);
  };

  const onQrScanned = useCallback(
    async (text: string) => {
      const jwt = extractJwt(text);
      if (!jwt) {
        setScanError('Scanned something that does not look like an EAS QR.');
        return;
      }
      setScanError(null);
      try {
        const result = await recordScan({ eventId, jwt, roster });
        const m = result.attendee
          ? roster.find((r) => r.id === result.attendee?.id) ?? { id: result.attendee.id, fullName: result.attendee.fullName, identifier: '' }
          : undefined;
        showFlash(result.status, m);
        void refreshState();
      } catch (err) {
        setScanError(err instanceof Error ? err.message : String(err));
      }
    },
    [eventId, roster, refreshState],
  );

  const onManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEntry.trim()) return;
    void onQrScanned(manualEntry.trim());
    setManualEntry('');
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top bar */}
      <header
        style={{
          padding: '12px 16px',
          background: online ? '#14532d' : '#7f1d1d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 14,
        }}
      >
        <span>
          {online ? '🟢 Online' : '🔴 Offline'} — {queueDepth === 0 ? 'queue empty' : `${queueDepth} scan${queueDepth === 1 ? '' : 's'} queued`}
        </span>
        <span style={{ fontWeight: 600 }}>{event?.name ?? 'Loading event…'}</span>
        <span>
          {summary ? `${summary.checkedIn} / ${summary.total}` : '— / —'}
        </span>
      </header>

      {/* Camera viewport */}
      <div style={{ position: 'relative', aspectRatio: '4/3', background: '#000' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* Flash overlay */}
        {flash && (
          <div
            key={flash.at}
            style={{
              position: 'absolute', inset: 0, background: flash.color, opacity: 0.85,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 700, color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.4)',
              animation: 'flash 1.5s ease-out',
            }}
          >
            <div>{flash.label}</div>
            {flash.attendee && <div style={{ fontSize: 22, fontWeight: 500, marginTop: 8 }}>{flash.attendee}</div>}
          </div>
        )}
        {cameraError && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Camera unavailable</div>
              <div style={{ fontSize: 14, color: '#fca5a5' }}>{cameraError}</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 12 }}>Use manual entry below.</div>
            </div>
          </div>
        )}
      </div>

      {/* Recent scans */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Recent
        </div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 14, color: '#64748b' }}>No scans yet — point the camera at a QR code.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recent.map((r) => (
              <li
                key={r.key}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', borderRadius: 8, background: '#1e293b', fontSize: 14,
                }}
              >
                <span>
                  <span style={{ color: STATUS_COLOR[r.status], fontWeight: 600 }}>{STATUS_LABEL[r.status]}</span>
                  {r.attendee && <span style={{ marginLeft: 8 }}>{r.attendee.fullName}</span>}
                </span>
                <span style={{ color: '#64748b', fontSize: 12 }}>
                  {new Date(r.at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Manual entry */}
      <form onSubmit={onManualSubmit} style={{ padding: '0 16px 24px', display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={manualEntry}
          onChange={(e) => setManualEntry(e.target.value)}
          placeholder="Paste QR URL or JWT…"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 14 }}
        />
        <button
          type="submit"
          style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', fontWeight: 600, fontSize: 14 }}
        >
          Submit
        </button>
      </form>
      {scanError && (
        <div style={{ padding: '0 16px 16px', color: '#fca5a5', fontSize: 13 }}>{scanError}</div>
      )}

      <style>{`@keyframes flash { 0% { opacity: 0; } 20% { opacity: 0.85; } 100% { opacity: 0; } }`}</style>
    </div>
  );
}
