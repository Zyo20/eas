'use client';

import { useState, useEffect, useCallback, FormEvent, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getToken, setToken, type Event, type Summary, type Attendee, type FlaggedRecord, type FlaggedCount } from '@/lib/api';
import type { EventDetailViewProps } from './types';

interface UseHooksParams extends EventDetailViewProps {}

export const useHooks = (_params: UseHooksParams = {}) => {
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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    try {
      const me = await api.get<{ organizationId: string }>('/auth/me');
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
    } finally {
      setLoading(false);
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
    try {
      const me = await api.get<{ organizationId: string }>('/auth/me');
      await api.post(`/orgs/${me.organizationId}/events/${eventId}/close`);
      void refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to close event');
    }
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

  async function onDelete() {
    if (!event || !confirm('Are you sure you want to delete this event? This action will soft-delete the event and audit records will be preserved.')) return;
    try {
      const me = await api.get<{ organizationId: string }>('/auth/me');
      await api.del(`/orgs/${me.organizationId}/events/${event.id}`);
      router.replace('/dashboard');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function onDownloadQr() {
    if (!event) return;
    try {
      const filename = `${event.name.replace(/[^a-z0-9]+/gi, '_')}_qr_sheet.pdf`;
      await api.download(`/orgs/${event.organizationId}/events/${event.id}/roster-qr-sheet.pdf`, filename);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'QR PDF download failed');
    }
  }

  const getScannerUrl = (evId: string) => {
    const envUrl = process.env.NEXT_PUBLIC_SCANNER_URL;
    if (envUrl) {
      return `${envUrl}/scan/${evId}`;
    }
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isLocalIp = hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.endsWith('.local');
      if (hostname === 'localhost' || hostname === '127.0.0.1' || isLocalIp) {
        return `http://${hostname}:5173/scan/${evId}`;
      }
    }
    return `https://scanner.eas.arrowtest.site/scan/${evId}`;
  };

  const filteredMissed = useMemo(() => {
    if (!filter) return missed;
    return missed.filter((m) => 
      m.fullName.toLowerCase().includes(filter.toLowerCase()) || 
      m.identifier.includes(filter)
    );
  }, [missed, filter]);

  return {
    event,
    summary,
    missed: filteredMissed,
    rawMissed: missed,
    attendees,
    flagged,
    flaggedCount,
    filter,
    setFilter,
    manual,
    setManual,
    msg,
    err,
    loading,
    onClose,
    onManualCheckIn,
    onDelete,
    onDownloadQr,
    getScannerUrl,
  };
};
