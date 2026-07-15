'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Attendee } from '@/lib/api';
import MapPicker from '@/components/MapPicker';

export default function NewEventPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    name: '',
    description: '',
    location: '',
    startsAt: '2026-08-10T09:00',
    endsAt: '2026-08-10T17:00',
    // Geofence (optional). Lat/Lng must be paired; radius defaults to 50m on the server
    // if the event has no geofence, but the form lets admin override per event.
    locationLat: '' as string,
    locationLng: '' as string,
    geofenceRadiusM: '50',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    (async () => {
      const me = await api.get<{ organizationId: string }>('/auth/me');
      setOrgId(me.organizationId);
      const res = await api.get<{ data: Attendee[] }>(`/orgs/${me.organizationId}/attendees`);
      setAttendees(res.data);
    })();
  }, []);

  const filtered = filter
    ? attendees.filter((a) => a.fullName.toLowerCase().includes(filter.toLowerCase()) || a.identifier.includes(filter))
    : attendees;

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setBusy(true);
    setErr(null);
    try {
      // Build the geofence payload. Send undefined for missing lat/lng so the server
      // treats the event as "no geofence" (scans go through, geofenceSkipped: true).
      const lat = form.locationLat.trim() === '' ? undefined : Number(form.locationLat);
      const lng = form.locationLng.trim() === '' ? undefined : Number(form.locationLng);
      const radius = Number(form.geofenceRadiusM);
      if (lat !== undefined && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
        throw new Error('Latitude must be a number between -90 and 90');
      }
      if (lng !== undefined && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
        throw new Error('Longitude must be a number between -180 and 180');
      }
      if (Number.isNaN(radius) || radius < 1 || radius > 10000) {
        throw new Error('Geofence radius must be 1–10000 meters');
      }
      const ev = await api.post<{ id: string }>(`/orgs/${orgId}/events`, {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        attendeeIds: Array.from(picked),
        locationLat: lat,
        locationLng: lng,
        geofenceRadiusM: radius,
      });
      router.push(`/events/${ev.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1 style={{ margin: '0 0 16px', fontSize: 22 }}>New event</h1>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Name">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={inp} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Starts at">
            <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required style={inp} />
          </Field>
          <Field label="Ends at">
            <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} required style={inp} />
          </Field>
        </div>
        <Field label="Location">
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={inp} />
        </Field>
        <Field label="Description (optional)">
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inp, minHeight: 60 }} />
        </Field>
        <Field label="Geofence (optional — leave blank for no geofence check)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 8, marginBottom: 12 }}>
            <input
              type="number"
              step="0.0000000001"
              min={-90}
              max={90}
              placeholder="Latitude"
              value={form.locationLat}
              onChange={(e) => setForm({ ...form, locationLat: e.target.value })}
              style={inp}
            />
            <input
              type="number"
              step="0.0000000001"
              min={-180}
              max={180}
              placeholder="Longitude"
              value={form.locationLng}
              onChange={(e) => setForm({ ...form, locationLng: e.target.value })}
              style={inp}
            />
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              title="Radius in meters"
              placeholder="50"
              value={form.geofenceRadiusM}
              onChange={(e) => setForm({ ...form, geofenceRadiusM: e.target.value })}
              style={inp}
            />
          </div>

          <MapPicker
            lat={form.locationLat.trim() === '' ? null : Number(form.locationLat)}
            lng={form.locationLng.trim() === '' ? null : Number(form.locationLng)}
            radius={Number(form.geofenceRadiusM) || 50}
            onChange={(latVal, lngVal) => setForm((prev) => ({
              ...prev,
              locationLat: latVal.toString(),
              locationLng: lngVal.toString(),
            }))}
          />

          <p style={{ ...sm, marginTop: 8 }}>Scans outside this radius will be flagged but not rejected.</p>
        </Field>
        <Field label={`Roster (${picked.size} of ${attendees.length})`}>
          <input
            type="search"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inp, marginBottom: 8 }}
          />
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: 6 }}>
            {filtered.map((a) => (
              <label
                key={a.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={picked.has(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <span style={{ color: '#64748b', minWidth: 80 }}>{a.identifier}</span>
                <span>{a.fullName}</span>
              </label>
            ))}
            {filtered.length === 0 && <div style={{ padding: 12, color: '#64748b', fontSize: 13 }}>No attendees match.</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, fontSize: 12 }}>
            <button type="button" onClick={() => setPicked(new Set(filtered.map((a) => a.id)))} style={smBtn}>Select all (filtered)</button>
            <button type="button" onClick={() => setPicked(new Set())} style={smBtn}>Clear</button>
          </div>
        </Field>
        {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
        <button
          type="submit"
          disabled={busy || picked.size === 0}
          style={{
            padding: '10px 16px', borderRadius: 6, border: 'none',
            background: busy || picked.size === 0 ? '#94a3b8' : '#1e293b',
            color: 'white', fontWeight: 600, fontSize: 14,
            cursor: busy || picked.size === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Creating…' : `Create event with ${picked.size} attendee${picked.size === 1 ? '' : 's'}`}
        </button>
      </form>
    </main>
  );
}

const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, width: '100%', boxSizing: 'border-box' };
const smBtn: React.CSSProperties = { padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1', background: 'white', fontSize: 12, cursor: 'pointer' };
const sm: React.CSSProperties = { color: '#64748b', fontSize: 12, margin: 0 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
      {label}
      {children}
    </label>
  );
}
