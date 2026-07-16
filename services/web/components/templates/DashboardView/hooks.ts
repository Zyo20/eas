'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken, type Event } from '@/lib/api';
import type { DashboardViewProps } from './types';

interface UseHooksParams extends DashboardViewProps {}

export const useHooks = (_params: UseHooksParams = {}) => {
  const router = useRouter();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'DRAFT' | 'CLOSED'>('ALL');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const me = await api.get<{ organizationId: string }>('/auth/me');
        const res = await api.get<{ data: Event[] }>(`/orgs/${me.organizationId}/events`);
        const list = res.data;
        // Sort by startsAt desc
        list.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
        setEvents(list);
      } catch (err) {
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
          setToken(null);
          router.replace('/login');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load events');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const getScannerUrl = (eventId: string) => {
    const envUrl = process.env.NEXT_PUBLIC_SCANNER_URL;
    if (envUrl) {
      return `${envUrl}/scan/${eventId}`;
    }
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isLocalIp = hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.endsWith('.local');
      if (hostname === 'localhost' || hostname === '127.0.0.1' || isLocalIp) {
        return `http://${hostname}:5173/scan/${eventId}`;
      }
    }
    return `https://scanner.eas.arrowtest.site/scan/${eventId}`;
  };

  // Compute metrics from all events
  const metrics = useMemo(() => {
    if (!events) return { total: 0, open: 0, draft: 0, closed: 0 };
    return {
      total: events.length,
      open: events.filter(e => e.status === 'OPEN').length,
      draft: events.filter(e => e.status === 'DRAFT').length,
      closed: events.filter(e => e.status === 'CLOSED').length,
    };
  }, [events]);

  // Client-side filtering of events list
  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter(e => {
      const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (e.location && e.location.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'ALL' || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [events, searchQuery, statusFilter]);

  return {
    events: filteredEvents,
    rawEvents: events,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    metrics,
    getScannerUrl,
  };
};
