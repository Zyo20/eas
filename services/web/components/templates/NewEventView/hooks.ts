'use client';

import { useState, useEffect, FormEvent, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Attendee } from '@/lib/api';
import type { NewEventViewProps } from './types';

interface UseHooksParams extends NewEventViewProps {}

export const useHooks = (_params: UseHooksParams = {}) => {
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
    status: 'DRAFT' as 'DRAFT' | 'OPEN' | 'CLOSED',
    locationLat: '',
    locationLng: '',
    geofenceRadiusM: '50',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<{ organizationId: string }>('/auth/me');
        setOrgId(me.organizationId);
        const res = await api.get<{ data: Attendee[] }>(`/orgs/${me.organizationId}/attendees`);
        setAttendees(res.data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to fetch attendees');
      }
    })();
  }, []);

  const filteredAttendees = useMemo(() => {
    if (!filter) return attendees;
    return attendees.filter((a) => 
      a.fullName.toLowerCase().includes(filter.toLowerCase()) || 
      a.identifier.includes(filter)
    );
  }, [attendees, filter]);

  const onBulkSelect = () => {
    if (!bulkText.trim()) return;
    const targets = new Set(
      bulkText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (targets.size === 0) return;
    const matchedIds = attendees
      .filter((a) => {
        const idLower = a.identifier.toLowerCase();
        return Array.from(targets).some((t) => idLower.startsWith(t.toLowerCase()));
      })
      .map((a) => a.id);

    setPicked((prev) => {
      const next = new Set(prev);
      matchedIds.forEach((id) => next.add(id));
      return next;
    });
    setBulkText('');
  };

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setPicked(new Set(filteredAttendees.map((a) => a.id)));
  };

  const clearAll = () => {
    setPicked(new Set());
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setBusy(true);
    setErr(null);
    try {
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
      setErr(e instanceof Error ? e.message : 'Create event failed');
    } finally {
      setBusy(false);
    }
  }

  return {
    form,
    setForm,
    picked,
    filteredAttendees,
    attendees,
    filter,
    setFilter,
    bulkText,
    setBulkText,
    busy,
    err,
    onBulkSelect,
    toggle,
    selectAll,
    clearAll,
    onSubmit,
  };
};
