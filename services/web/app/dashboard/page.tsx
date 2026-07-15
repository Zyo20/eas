'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getToken, setToken, type Event } from '@/lib/api';

const getScannerUrl = (eventId: string) => {
  const envUrl = process.env.NEXT_PUBLIC_SCANNER_URL;
  if (envUrl) {
    return `${envUrl}/scan/${eventId}`;
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalIp = hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.endsWith('.local');
    if (hostname === 'localhost' || hostname === '127.0.0.1' || isLocalIp) {
      // Use the same hostname but with the scanner dev port (5173)
      return `http://${hostname}:5173/scan/${eventId}`;
    }
  }
  return `https://scanner.eas.arrowtest.site/scan/${eventId}`;
};

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const me = await api.get<{ organizationId: string }>('/auth/me');
        const res = await api.get<{ data: Event[] }>(`/orgs/${me.organizationId}/events`);
        const list = res.data;
        // sort by startsAt desc
        list.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
        setEvents(list);
      } catch (err) {
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
          setToken(null);
          router.replace('/login');
        } else {
          setError(err instanceof Error ? err.message : 'failed to load');
        }
      }
    })();
  }, [router]);

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Events</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/attendees"
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a', textDecoration: 'none', fontSize: 13 }}
          >
            Attendees
          </Link>
          <Link
            href="/events/new"
            style={{ padding: '6px 12px', borderRadius: 6, background: '#1e293b', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
          >
            + New event
          </Link>
          <button
            onClick={() => { setToken(null); router.replace('/login'); }}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', fontSize: 13, cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </header>

      {error && <div style={{ color: '#dc2626' }}>{error}</div>}
      {events === null && !error && <div style={{ color: '#64748b' }}>Loading…</div>}
      {events && events.length === 0 && (
        <div style={{ color: '#64748b' }}>No events yet — create one to get started.</div>
      )}
      {events && events.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
              <th style={th}>Name</th>
              <th style={th}>Status</th>
              <th style={th}>Starts</th>
              <th style={th}>Location</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={td}>
                  <Link href={`/events/${ev.id}`} style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 500 }}>
                    {ev.name}
                  </Link>
                </td>
                <td style={td}><StatusBadge status={ev.status} /></td>
                <td style={td}>{new Date(ev.startsAt).toLocaleString()}</td>
                <td style={td}>{ev.location ?? '—'}</td>
                <td style={td}>
                  <a
                    href={getScannerUrl(ev.id)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none' }}
                  >
                    Open scanner →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14 };

function StatusBadge({ status }: { status: 'DRAFT' | 'OPEN' | 'CLOSED' }) {
  const map = {
    DRAFT: { bg: '#e2e8f0', fg: '#475569' },
    OPEN: { bg: '#dcfce7', fg: '#166534' },
    CLOSED: { bg: '#fee2e2', fg: '#991b1b' },
  };
  const c = map[status];
  return (
    <span style={{ background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
      {status}
    </span>
  );
}
