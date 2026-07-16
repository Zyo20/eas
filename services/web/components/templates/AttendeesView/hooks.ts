'use client';

import { useState, useEffect, useRef, FormEvent, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  getToken,
  setToken,
  type Attendee,
  bulkCreateAccounts,
  type BulkCreateAccountsResponse,
  bulkDeleteAttendees,
  type BulkDeleteResponse,
  cleanupOrphanUsers,
  type CleanupOrphanResult,
} from '@/lib/api';
import * as XLSX from 'xlsx';
import type { AttendeesViewProps, ModalState, SingleAccountResult } from './types';

interface UseHooksParams extends AttendeesViewProps {}

export const useHooks = (_params: UseHooksParams = {}) => {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [list, setList] = useState<Attendee[] | null>(null);
  const [form, setForm] = useState({ identifier: '', fullName: '', email: '' });
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = async (o: string) => {
    const res = await api.get<{ data: Attendee[] }>(`/orgs/${o}/attendees`);
    const atts = res.data;
    atts.sort((a, b) => a.fullName.localeCompare(b.fullName));
    setList(atts);
  };

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    (async () => {
      try {
        const me = await api.get<{ organizationId: string }>('/auth/me');
        setOrgId(me.organizationId);
        await refresh(me.organizationId);
      } catch (e) {
        if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
          setToken(null);
          router.replace('/login');
        } else {
          setErr(e instanceof Error ? e.message : 'failed to load');
        }
      }
    })();
  }, [router]);

  function onBulkSelect() {
    if (!bulkText.trim() || !list) return;
    const targets = new Set(
      bulkText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (targets.size === 0) return;
    const matchedIds = list
      .filter((a) => {
        const idLower = a.identifier.toLowerCase();
        return Array.from(targets).some((t) => idLower.startsWith(t.toLowerCase()));
      })
      .map((a) => a.id);

    setSelected((prev) => {
      const next = new Set(prev);
      matchedIds.forEach((id) => next.add(id));
      return next;
    });
    setBulkText('');
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/orgs/${orgId}/attendees`, form);
      setForm({ identifier: '', fullName: '', email: '' });
      await refresh(orgId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create attendee failed');
    } finally {
      setBusy(false);
    }
  }

  async function onImport(e: FormEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (!file || !orgId) return;
    setErr(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = getToken();
      const res = await fetch(`/api/v1/orgs/${orgId}/attendees/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      alert(`Imported ${result.created} attendees; ${result.errors?.length ?? 0} errors.`);
      await refresh(orgId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed');
    } finally {
      e.currentTarget.value = '';
    }
  }

  async function onCreateAccount(attendee: Attendee) {
    if (!orgId) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await api.post<SingleAccountResult>(
        `/orgs/${orgId}/attendees/${attendee.id}/create-account`,
        { email: attendee.email },
      );
      setModal({ kind: 'single', result });
      await refresh(orgId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Account creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function onBulkCreateAccounts() {
    if (!orgId || selected.size === 0) return;
    setBulkBusy(true);
    setErr(null);
    try {
      const ids = Array.from(selected);
      const result = await bulkCreateAccounts(orgId, ids);
      setModal({ kind: 'bulk', result, orgId, ids });
      setSelected(new Set());
      await refresh(orgId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bulk account creation failed');
    } finally {
      setBulkBusy(false);
    }
  }

  async function onCleanupAndRetry() {
    if (modal.kind !== 'bulk') return;
    if (!orgId) return;
    setCleanupBusy(true);
    setErr(null);
    try {
      const cleanup: CleanupOrphanResult = await cleanupOrphanUsers(orgId);
      const result = await bulkCreateAccounts(orgId, modal.ids);
      setModal({
        kind: 'bulk',
        result,
        orgId,
        ids: modal.ids,
        cleanup,
      });
      await refresh(orgId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'cleanup + retry failed');
    } finally {
      setCleanupBusy(false);
    }
  }

  function onAskBulkDelete() {
    if (selected.size === 0) return;
    setModal({ kind: 'bulk-delete-confirm', ids: Array.from(selected) });
  }

  async function confirmBulkDelete() {
    if (!orgId) return;
    if (modal.kind !== 'bulk-delete-confirm') return;
    const ids = modal.ids;
    setDeleteBusy(true);
    setErr(null);
    try {
      const result = await bulkDeleteAttendees(orgId, ids);
      setSelected(new Set());
      setModal({ kind: 'bulk-delete-result', result });
      await refresh(orgId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'bulk delete failed');
      setModal({ kind: 'none' });
    } finally {
      setDeleteBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!list) return;
    const visible = filteredAttendeesList.map((a) => a.id);
    const allSelected = visible.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visible.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        visible.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function copyToClipboard(text: string, label = 'Copied!') {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(label);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyFeedback(null), 2000);
    });
  }

  function downloadBulkCsv(result: BulkCreateAccountsResponse) {
    const header = 'attendeeId,email,setupUrl,emailSent,emailError';
    const rows = result.created.map(
      (e) =>
        `"${e.attendeeId}","${e.email}","${e.setupUrl}",${e.emailSent},"${
          e.emailError ? e.emailError.replace(/"/g, '""') : ''
        }"`,
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `setup-links-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSampleExcel() {
    const data = [
      { identifier: 'ATT-001', fullName: 'John Doe', email: 'john.doe@example.com' },
      { identifier: 'ATT-002', fullName: 'Jane Smith', email: 'jane.smith@example.com' }
    ];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendees_bulk_import_sample.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const filteredAttendeesList = useMemo(() => {
    if (!list) return [];
    if (!filter) return list;
    return list.filter((a) => 
      a.fullName.toLowerCase().includes(filter.toLowerCase()) ||
      a.identifier.includes(filter)
    );
  }, [list, filter]);

  return {
    orgId,
    list: filteredAttendeesList,
    rawList: list,
    form,
    setForm,
    err,
    filter,
    setFilter,
    busy,
    selected,
    modal,
    setModal,
    bulkBusy,
    bulkText,
    setBulkText,
    deleteBusy,
    cleanupBusy,
    copyFeedback,
    onBulkSelect,
    onCreate,
    onImport,
    onCreateAccount,
    onBulkCreateAccounts,
    onCleanupAndRetry,
    onAskBulkDelete,
    confirmBulkDelete,
    toggleSelect,
    toggleSelectAll,
    copyToClipboard,
    downloadBulkCsv,
    downloadSampleExcel,
  };
};
