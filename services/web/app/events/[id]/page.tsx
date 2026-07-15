'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getToken, setToken, type Event, type Summary, type Attendee, type FlaggedRecord, type FlaggedCount } from '@/lib/api';

export default function EventDetailPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [missed, setMissed] = useState<Attendee[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [flagged, setFlagged] = useState<FlaggedRecord[]>([]);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [filter, setFilter] = useState('');
  const [manual, setManual] = useState({ attendeeId: '', note: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    try {
      const me = await api.get<{ organizationId: string }>('/auth/me');
      // Fetch summary + flagged list + the rest in parallel. The flagged-count
      // endpoint is fast and the flagged list endpoint returns the full records.
      const [ev, sum, who, atts, flagList, flagCount] = await Promise.all([
        api.get<Event>(`/orgs/${me.organizationId}/events/${eventId}`),
        api.get<Summary>(`/events/${eventId}/attendance/summary`),
        api.get<Attendee[]>(`/events/${eventId}/attendance/who-hasnt-arrived`),
        api.get<{ data: Attendee[] }>(`/orgs/${me.organizationId}/attendees`),
        api.get<FlaggedRecord[]>(`/events/${eventId}/attendance`).then((all) => all.filter((r) => r.outsideGeofence)),
        api.get<FlaggedCount>(`/events/${eventId}/attendance/flagged-count`),
      ]);
      setEvent(ev);
      setSummary(sum);
      setMissed(who);
      setAttendees(atts.data);
      setFlagged(flagList);
      setFlaggedCount(flagCount.flaggedCount);
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
        setToken(null);
        router.replace('/login');
      } else {
        setErr(e instanceof Error ? e.message : 'failed to load');
      }
    }
  }, [eventId, router]);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh, router]);

  async function onClose() {
    if (!eventId) return;
    const me = await api.get<{ organizationId: string }>('/auth/me');
    await api.post(`/orgs/${me.organizationId}/events/${eventId}/close`);
    void refresh();
  }

  async function onManualCheckIn(e: FormEvent) {
    e.preventDefault();
    if (!manual.attendeeId) return;
    setMsg(null);
    setErr(null);
    try {
      const r = await api.post<{ status: string; attendee: { fullName: string } }>(`/events/${eventId}/attendance/manual`, {
        attendeeId: manual.attendeeId,
        note: manual.note || undefined,
      });
      setMsg(`${r.attendee.fullName} checked in (${r.status})`);
      setManual({ attendeeId: '', note: '' });
      void refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'manual check-in failed');
    }
  }

  if (err) return <main style={{ padding: 24, color: '#dc2626' }}>{err}</main>;
  if (!event || !summary) return <main style={{ padding: 24, color: '#64748b' }}>Loading…</main>;

  const filteredMissed = filter
    ? missed.filter((m) => m.fullName.toLowerCase().includes(filter.toLowerCase()) || m.identifier.includes(filter))
    : missed;

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <Link href="/dashboard" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>← Back to events</Link>
      <header style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>{event.name}</h1>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            {new Date(event.startsAt).toLocaleString()} → {new Date(event.endsAt).toLocaleString()}
            {event.location && <> · {event.location}</>}
          </div>
          {event.locationLat != null && event.locationLng != null && (
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
              📍 Geofence: {event.locationLat.toFixed(6)}, {event.locationLng.toFixed(6)} (radius {event.geofenceRadiusM ?? 50}m)
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={`https://scanner.eas.arrowtest.site/scan/${event.id}`}
            target="_blank"
            rel="noreferrer"
            style={{ padding: '8px 12px', borderRadius: 6, background: '#1d4ed8', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
          >
            Open scanner
          </a>
          <button
            onClick={async () => {
              try {
                const filename = `${event.name.replace(/[^a-z0-9]+/gi, '_')}_qr_sheet.pdf`;
                await api.download(`/orgs/${event.organizationId}/events/${event.id}/roster-qr-sheet.pdf`, filename);
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'QR PDF download failed');
              }
            }}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', color: '#0f172a', fontSize: 13, cursor: 'pointer' }}
          >
            Download QR PDF
          </button>
          {event.status !== 'CLOSED' && (
            <button
              onClick={onClose}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', fontSize: 13, cursor: 'pointer' }}
            >
              Close event
            </button>
          )}
        </div>
      </header>

      {/* Live summary — 5 tiles, wrap on narrow viewports */}
      <section style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <Stat label="Total" value={summary.total} />
        <Stat label="Checked in" value={summary.checkedIn} accent="green" />
        <Stat label="Remaining" value={summary.remaining} accent={summary.remaining === 0 ? 'green' : 'amber'} />
        <Stat label="Percent" value={`${summary.percent}%`} />
        <Stat
          label="Outside geofence"
          value={flaggedCount}
          accent={flaggedCount > 0 ? 'amber' : 'green'}
          hint={flaggedCount > 0 ? '⚠ Verify with staff' : undefined}
        />
      </section>

      {/* Progress bar */}
      <div style={{ marginTop: 12, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${summary.percent}%`, height: '100%', background: summary.percent === 100 ? '#16a34a' : '#3b82f6', transition: 'width 0.5s' }} />
      </div>

      {/* Who hasn't arrived */}
      <section style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Who hasn't arrived ({missed.length})</h2>
          <input
            type="search"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
          />
        </div>
        {filteredMissed.length === 0 ? (
          <div style={{ color: '#16a34a', fontSize: 14 }}>Everyone is here. 🎉</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
            {filteredMissed.map((m) => (
              <li key={m.id} style={{ padding: '6px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#78350f' }}>
                <span style={{ fontWeight: 600 }}>{m.identifier}</span> {m.fullName}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Flagged (outside-geofence) records. These scans went through but may
          warrant a second look — staff may have been off-site, or the device's
          location may be wrong. Show the actual distance so admins can decide. */}
      {flagged.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>⚠ Outside geofence ({flagged.length})</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {flagged.map((f) => (
              <li key={f.id} style={{ padding: '8px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#78350f' }}>
                <div style={{ fontWeight: 600 }}>{f.attendee.identifier} {f.attendee.fullName}</div>
                <div style={{ color: '#92400e', marginTop: 2 }}>
                  {new Date(f.scannedAt).toLocaleString()} · via {f.source.toLowerCase()}
                </div>
                {f.distanceM !== null && (
                  <div style={{ color: '#92400e', marginTop: 2 }}>
                    {Math.round(f.distanceM)}m from event location
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Manual check-in */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Manual check-in</h2>
        <form onSubmit={onManualCheckIn} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
            Attendee
            <select
              value={manual.attendeeId}
              onChange={(e) => setManual({ ...manual, attendeeId: e.target.value })}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
            >
              <option value="">— select —</option>
              {attendees.map((a) => (
                <option key={a.id} value={a.id}>{a.identifier} {a.fullName}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
            Note (optional)
            <input
              type="text"
              value={manual.note}
              onChange={(e) => setManual({ ...manual, note: e.target.value })}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
          </label>
          <button
            type="submit"
            disabled={!manual.attendeeId}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: manual.attendeeId ? '#1e293b' : '#94a3b8', color: 'white', fontWeight: 600, fontSize: 13, cursor: manual.attendeeId ? 'pointer' : 'not-allowed' }}
          >
            Check in
          </button>
        </form>
        {msg && <div style={{ marginTop: 8, color: '#16a34a', fontSize: 13 }}>{msg}</div>}
      </section>
    </main>
  );
}

function Stat({ label, value, accent, hint }: { label: string; value: number | string; accent?: 'green' | 'amber'; hint?: string }) {
  const color = accent === 'green' ? '#16a34a' : accent === 'amber' ? '#ca8a04' : '#0f172a';
  return (
    <div style={{ padding: 12, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
