'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

export type Preview =
  | { ok: true; event: { id: string; name: string; startsAt: string; endsAt: string }; attendee: { id: string; identifier: string; fullName: string }; onRoster: boolean; alreadyCheckedIn: boolean }
  | { ok: false; status: 'invalid_token' | 'not_found' | 'unknown' };

export interface UseHooksParams {}

export const useHooks = (_params: UseHooksParams = {}) => {
  const params = useParams<{ eventId: string }>();
  const search = useSearchParams();
  const token = search.get('t') || '';
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setPreview({ ok: false, status: 'invalid_token' });
      return;
    }
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
        checked_in: 'You’re checked in. Have a great event!',
        already_checked_in: 'You were already checked in. Welcome back!',
        not_in_roster: 'You’re not on the roster for this event. Talk to a facilitator.',
        event_closed: 'This event is already closed.',
        invalid_token: 'This QR code is invalid. Please scan a fresh one.',
      };
      setResult({ status: body.status, message: messages[body.status] ?? body.status });
    } catch (e) {
      setResult({ status: 'unknown', message: 'Check-in failed due to network error.' });
    } finally {
      setConfirming(false);
    }
  }

  return {
    preview,
    confirming,
    result,
    confirm,
  };
};
