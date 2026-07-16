'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken } from '@/lib/api';
import type { MeViewProps, MyProfile, MyEvent, MyAttendanceRecord, QrPayload } from './types';

interface UseHooksParams extends MeViewProps {}

export const useHooks = (_params: UseHooksParams = {}) => {
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [events, setEvents] = useState<MyEvent[] | null>(null);
  const [attendance, setAttendance] = useState<MyAttendanceRecord[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState<{ eventId: string; eventName: string; format: 'svg' | 'png'; payload: QrPayload } | null>(null);
  const [qrLoading, setQrLoading] = useState<string | null>(null);

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
      if (msg.includes('401') || msg.includes('403')) {
        setToken(null);
        router.replace('/login');
      }
    }
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    void loadAll();
  }, [loadAll, router]);

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

  return {
    profile,
    events,
    attendance,
    err,
    qrModal,
    setQrModal,
    qrLoading,
    fetchQr,
    downloadQr,
    logout,
  };
};
