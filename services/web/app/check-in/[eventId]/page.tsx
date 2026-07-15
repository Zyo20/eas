'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

type Preview =
  | { ok: true; event: { id: string; name: string; startsAt: string; endsAt: string }; attendee: { id: string; identifier: string; fullName: string }; onRoster: boolean; alreadyCheckedIn: boolean }
  | { ok: false; status: 'invalid_token' | 'not_found' | 'unknown' };

export default function CheckInPage() {
  const params = useParams<{ eventId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get('t') || '';
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    if (!token) { setPreview({ ok: false, status: 'invalid_token' }); return; }
    fetch(`/api/v1/check-in/${params.eventId}?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json();
        if (r.status === 200 && body.attendee) setPreview({ ok: true, ...body });
        else setPreview({ ok: false, status: body.status ?? 'unknown' });
      })
      .catch(() => setPreview({ ok: false, status: 'unknown' }));
  }, [params.eventId, token]);

  async function confirm() {
    setConfirming(true);
    try {
      const r = await fetch(`/api/v1/check-in/${params.eventId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, deviceId: 'web-fallback' }),
      });
      const body = await r.json();
      const messages: Record<string, string> = {
        checked_in: 'You\u2019re checked in. Have a great event!',
        already_checked_in: 'You were already checked in. Welcome back!',
        not_in_roster: 'You\u2019re not on the roster for this event. Talk to a facilitator.',
        event_closed: 'This event is already closed.',
        invalid_token: 'This QR code is invalid. Please scan a fresh one.',
      };
      setResult({ status: body.status, message: messages[body.status] ?? body.status });
    } finally {
      setConfirming(false);
    }
  }

  if (!preview) return <main style={{ padding: 32, textAlign: 'center' }}>Loading…</main>;

  if (!preview.ok) {
    const msg = preview.status === 'invalid_token'
      ? 'This QR code is invalid. Please scan a fresh one.'
      : 'Could not load this check-in link.';
    return (
      <main style={{ padding: 32, textAlign: 'center', color: '#991b1b' }}>
        <h1 style={{ fontSize: 22 }}>Hmm, that didn\u2019t work</h1>
        <p>{msg}</p>
      </main>
    );
  }

  if (result) {
    const color = result.status === 'checked_in' || result.status === 'already_checked_in' ? '#166534' : '#991b1b';
    return (
      <main style={{ padding: 32, textAlign: 'center', color }}>
        <h1 style={{ fontSize: 22 }}>{result.message}</h1>
        <p style={{ color: '#64748b', marginTop: 8 }}>{preview.event.name}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 32, maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
      <h1 style={{ fontSize: 18, color: '#64748b', margin: 0 }}>Confirm check-in</h1>
      <h2 style={{ fontSize: 26, margin: '8px 0 4px' }}>{preview.event.name}</h2>
      <p style={{ marginTop: 24, color: '#0f172a' }}>Hi <strong>{preview.attendee.fullName}</strong> ({preview.attendee.identifier})</p>
      {!preview.onRoster && (
        <p style={{ color: '#b45309', marginTop: 8 }}>You\u2019re not on the roster. A facilitator can override.</p>
      )}
      {preview.alreadyCheckedIn && (
        <p style={{ color: '#166534', marginTop: 8 }}>You were already checked in earlier.</p>
      )}
      <button
        onClick={confirm}
        disabled={confirming}
        style={{
          marginTop: 24, padding: '14px 28px', fontSize: 18, fontWeight: 600,
          background: '#0f172a', color: 'white', border: 0, borderRadius: 8,
          cursor: confirming ? 'default' : 'pointer', opacity: confirming ? 0.6 : 1,
        }}
      >
        {confirming ? 'Checking you in…' : 'Yes, check me in'}
      </button>
      <p style={{ marginTop: 32, fontSize: 12, color: '#94a3b8' }}>
        Not you? Close this page and ask a facilitator.
      </p>
    </main>
  );
}
