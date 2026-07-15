'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setToken } from '@/lib/api';

type MyProfile = {
  id: string;
  identifier: string;
  fullName: string;
  email: string;
  organization: { name: string; id: string; slug: string };
};

type MyEvent = {
  id: string;
  name: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
};

type MyAttendanceRecord = {
  recordId: string;
  event: { id: string; name: string; startsAt: string; endsAt: string };
  scannedAt: string;
  source: 'SCAN' | 'MANUAL' | 'IMPORT';
  outsideGeofence: boolean;
  distanceM: number | null;
  geofenceSkipped: boolean;
};

type QrPayload = {
  token: string;
  url: string;
  format: 'svg' | 'png';
  image: string; // base64
  imageMime: string;
};

const styles = {
  main: { maxWidth: 720, margin: '0 auto', padding: '24px 20px', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 } as React.CSSProperties,
  h1: { margin: 0, fontSize: 22 } as React.CSSProperties,
  h2: { margin: '24px 0 12px', fontSize: 16, color: '#475569' } as React.CSSProperties,
  card: { border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: 'white', marginBottom: 8 } as React.CSSProperties,
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' } as React.CSSProperties,
  muted: { color: '#64748b', fontSize: 13 } as React.CSSProperties,
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 } as React.CSSProperties,
  badgeGood: { background: '#dcfce7', color: '#166534' } as React.CSSProperties,
  badgeWarn: { background: '#fef3c7', color: '#92400e' } as React.CSSProperties,
  badgeNeutral: { background: '#e2e8f0', color: '#475569' } as React.CSSProperties,
  linkBtn: { display: 'inline-block', padding: '6px 12px', borderRadius: 6, background: '#1e293b', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600 } as React.CSSProperties,
  ghostBtn: { display: 'inline-block', padding: '6px 12px', borderRadius: 6, background: 'transparent', color: '#1e293b', border: '1px solid #cbd5e1', textDecoration: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  qrImg: { display: 'block', maxWidth: 200, height: 'auto', marginTop: 8 } as React.CSSProperties,
};

export default function MePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [events, setEvents] = useState<MyEvent[] | null>(null);
  const [attendance, setAttendance] = useState<MyAttendanceRecord[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Per-event QR modal state. `format` is the chosen output; `payload` is the API response.
  const [qrModal, setQrModal] = useState<{ eventId: string; eventName: string; format: 'svg' | 'png'; payload: QrPayload } | null>(null);
  const [qrLoading, setQrLoading] = useState<string | null>(null); // eventId currently loading

  const loadAll = useCallback(async () => {
    setErr(null);
    try {
      const [p, e, a] = await Promise.all([
        api.get<MyProfile>('/me'),
        api.get<{ data: MyEvent[] }>('/me/events'),
        api.get<{ data: MyAttendanceRecord[] }>('/me/attendance'),
      ]);
      setProfile(p);
      setEvents(e.data);
      setAttendance(a.data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'load failed';
      setErr(msg);
      // 403/401 → bounce to login
      if (msg.includes('401') || msg.includes('403')) {
        setToken(null);
        router.replace('/login');
      }
    }
  }, [router]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function fetchQr(eventId: string, eventName: string, format: 'svg' | 'png') {
    setQrLoading(eventId);
    try {
      const payload = await api.get<QrPayload>(`/me/events/${eventId}/qr.${format}`);
      setQrModal({ eventId, eventName, format, payload });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'qr fetch failed');
    } finally {
      setQrLoading(null);
    }
  }

  function downloadQr() {
    if (!qrModal) return;
    // Convert base64 → blob → object URL → click. Same shape as the api.download helper,
    // but we already have the data in memory from the fetch.
    const byteChars = atob(qrModal.payload.image);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: qrModal.payload.imageMime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${qrModal.eventId}.${qrModal.format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function logout() {
    setToken(null);
    router.replace('/login');
  }

  if (err && !profile) {
    return (
      <main style={styles.main}>
        <p>Error: {err}</p>
        <Link href="/login" style={styles.linkBtn}>Sign in again</Link>
      </main>
    );
  }
  if (!profile) {
    return (
      <main style={styles.main}>
        <p style={styles.muted}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>My Account</h1>
          <p style={styles.muted}>{profile.organization.name}</p>
        </div>
        <button onClick={logout} style={styles.ghostBtn}>Sign out</button>
      </header>

      <h2 style={styles.h2}>Profile</h2>
      <div style={styles.card}>
        <div style={styles.row}><span style={styles.muted}>Name</span><span>{profile.fullName}</span></div>
        <div style={styles.row}><span style={styles.muted}>Identifier</span><span>{profile.identifier}</span></div>
        <div style={styles.row}><span style={styles.muted}>Email</span><span>{profile.email}</span></div>
      </div>

      <h2 style={styles.h2}>My events</h2>
      {events === null && <p style={styles.muted}>Loading…</p>}
      {events !== null && events.length === 0 && (
        <p style={styles.muted}>You have no upcoming events.</p>
      )}
      {events?.map((e) => (
        <div key={e.id} style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{e.name}</div>
              <div style={styles.muted}>
                {new Date(e.startsAt).toLocaleString()} – {new Date(e.endsAt).toLocaleString()}
              </div>
              {e.location && <div style={styles.muted}>{e.location}</div>}
            </div>
            <span style={{
              ...styles.badge,
              ...(e.status === 'OPEN' ? styles.badgeGood : e.status === 'CLOSED' ? styles.badgeNeutral : styles.badgeWarn),
              flexShrink: 0,
            }}>
              {e.status}
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => fetchQr(e.id, e.name, 'svg')} style={styles.linkBtn}>
              {qrLoading === e.id ? 'Loading…' : 'View QR'}
            </button>
          </div>
        </div>
      ))}

      <h2 style={styles.h2}>My attendance history</h2>
      {attendance === null && <p style={styles.muted}>Loading…</p>}
      {attendance !== null && attendance.length === 0 && (
        <p style={styles.muted}>No check-ins yet.</p>
      )}
      {attendance?.map((r) => (
        <div key={r.recordId} style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.event.name}</div>
              <div style={styles.muted}>
                {new Date(r.scannedAt).toLocaleString()} · via {r.source.toLowerCase()}
              </div>
              {r.outsideGeofence && (
                <div style={{ ...styles.muted, color: '#b91c1c', marginTop: 4 }}>
                  ⚠ Outside geofence ({r.distanceM ? `${r.distanceM.toLocaleString()}m from event location` : 'distance unknown'})
                </div>
              )}
            </div>
            <span style={{
              ...styles.badge,
              ...(r.outsideGeofence ? styles.badgeWarn : styles.badgeGood),
              flexShrink: 0,
            }}>
              {r.outsideGeofence ? 'Flagged' : 'OK'}
            </span>
          </div>
        </div>
      ))}

      {qrModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setQrModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
            display: 'grid', placeItems: 'center', zIndex: 50, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%' }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>{qrModal.eventName}</h3>
            <p style={{ ...styles.muted, marginTop: 0 }}>Show this to the staff at check-in.</p>
            <img
              src={`data:${qrModal.payload.imageMime};base64,${qrModal.payload.image}`}
              alt="Your check-in QR"
              style={{ ...styles.qrImg, margin: '0 auto' }}
            />
            <p style={{ ...styles.muted, fontSize: 11, wordBreak: 'break-all', marginTop: 8 }}>
              {qrModal.payload.url}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={downloadQr} style={styles.linkBtn}>Download</button>
              <button onClick={() => setQrModal(null)} style={{ ...styles.ghostBtn, marginLeft: 'auto' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
