'use client';

import { useEffect, useState, useRef, FormEvent } from 'react';
import {
  api,
  type Attendee,
  bulkCreateAccounts,
  type BulkCreateAccountsResponse,
  bulkDeleteAttendees,
  type BulkDeleteResponse,
  cleanupOrphanUsers,
  type CleanupOrphanResult,
} from '@/lib/api';
import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────────────

type SingleAccountResult = {
  attendeeId: string;
  userId: string;
  email: string;
  setupUrl: string;
  note: string;
};

type ModalState =
  | { kind: 'none' }
  | { kind: 'single'; result: SingleAccountResult }
  | { kind: 'bulk'; result: BulkCreateAccountsResponse; orgId: string; ids: string[]; cleanup?: CleanupOrphanResult }
  // Confirm step — admin is about to fire the bulk delete. Shows the
  // selected attendees by name so the admin can sanity-check the list.
  | { kind: 'bulk-delete-confirm'; ids: string[] }
  // Result step — server returned the partial-success response.
  | { kind: 'bulk-delete-result'; result: BulkDeleteResponse };

// ── Main component ─────────────────────────────────────────────────────────

export default function AttendeesPage() {
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
      .filter((a) => targets.has(a.identifier))
      .map((a) => a.id);

    setSelected((prev) => {
      const next = new Set(prev);
      matchedIds.forEach((id) => next.add(id));
      return next;
    });
    setBulkText('');
  }

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = async (o: string) => {
    const res = await api.get<{ data: Attendee[] }>(`/orgs/${o}/attendees`);
    const atts = res.data;
    atts.sort((a, b) => a.fullName.localeCompare(b.fullName));
    setList(atts);
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<{ organizationId: string }>('/auth/me');
        setOrgId(me.organizationId);
        await refresh(me.organizationId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'failed to load');
      }
    })();
  }, []);

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
      setErr(e instanceof Error ? e.message : 'create failed');
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
      const token = localStorage.getItem('eas-token');
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
      setErr(e instanceof Error ? e.message : 'import failed');
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
      setErr(e instanceof Error ? e.message : 'account creation failed');
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
      setErr(e instanceof Error ? e.message : 'bulk account creation failed');
    } finally {
      setBulkBusy(false);
    }
  }

  /**
   * "Free emails & retry" — fires when the bulk-create result is all
   * email_taken. Calls cleanupOrphanUsers (which soft-deletes User rows
   * linked to soft-deleted Attendees or with no Attendee owner), then
   * re-runs bulkCreateAccounts on the same ids with the same modal in place.
   */
  async function onCleanupAndRetry() {
    if (modal.kind !== 'bulk') return;
    if (!orgId) return;
    setCleanupBusy(true);
    setErr(null);
    try {
      const cleanup: CleanupOrphanResult = await cleanupOrphanUsers(orgId);
      // Now retry the original bulk-create on the same ids.
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

  /**
   * Opens the confirm modal. The actual API call happens in
   * `confirmBulkDelete` so the admin can see the names before firing.
   */
  function onAskBulkDelete() {
    if (selected.size === 0) return;
    setModal({ kind: 'bulk-delete-confirm', ids: Array.from(selected) });
  }

  /**
   * Fires the bulk-delete request and shows the result modal.
   * Soft-delete preserves AttendanceRecord / EventRoster rows, so this is
   * reversible in the DB even though there's no UI restore button yet.
   */
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
    const visible = filtered.map((a) => a.id);
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

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (err) return <main style={{ padding: 24, color: '#dc2626' }}>{err}</main>;
  if (list === null) return <main style={{ padding: 24, color: '#64748b' }}>Loading…</main>;

  const filtered = filter
    ? list.filter(
        (a) =>
          a.fullName.toLowerCase().includes(filter.toLowerCase()) ||
          a.identifier.includes(filter),
      )
    : list;

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((a) => selected.has(a.id));
  const someSelected = selected.size > 0;

  // ── Modal ──────────────────────────────────────────────────────────────────

  const renderModal = () => {
    if (modal.kind === 'none') return null;

    const closeModal = () => setModal({ kind: 'none' });

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 1000,
          padding: 16,
        }}
        onClick={closeModal}
      >
        <div
          style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            maxWidth: 600,
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {modal.kind === 'single' && (
            <>
              <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Account Created ✓</h2>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                Share the setup link with <strong>{modal.result.email}</strong>.
                It can only be used once and expires in 7 days.
              </p>
              <div
                style={{
                  background: '#f1f5f9',
                  borderRadius: 8,
                  padding: 12,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  wordBreak: 'break-all',
                  marginBottom: 12,
                }}
              >
                {modal.result.setupUrl}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  id="copy-setup-url"
                  onClick={() => copyToClipboard(modal.result.setupUrl, 'Link copied!')}
                  style={btnStyle}
                >
                  {copyFeedback ?? '📋 Copy link'}
                </button>
                <button onClick={closeModal} style={{ ...btnStyle, background: '#f1f5f9', color: '#1e293b' }}>
                  Close
                </button>
              </div>
            </>
          )}

          {modal.kind === 'bulk' && (
            <>
              <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>
                {modal.result.summary.created} Setup Links Generated ✓
              </h2>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                {modal.result.summary.created} account(s) created,{' '}
                {modal.result.summary.skipped} skipped out of{' '}
                {modal.result.summary.requested} requested.
                {modal.result.summary.emailFailures > 0 && (
                  <>
                    {' '}
                    <span style={{ color: '#b45309', fontWeight: 600 }}>
                      {modal.result.summary.emailFailures} email
                      {modal.result.summary.emailFailures === 1 ? '' : 's'} failed to send
                    </span>
                    {' '}
                    — copy the links below and send manually.
                  </>
                )}
              </p>

              {modal.result.summary.emailFailures > 0 && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 12,
                    fontSize: 12,
                    color: '#78350f',
                  }}
                >
                  ⚠ <strong>SMTP rate-limited or unreachable.</strong> The accounts were
                  created, but the setup email could not be delivered. Copy each
                  setup URL below and send it to the attendee manually (e.g. via
                  personal email, messenger). The error from the provider:{' '}
                  <code style={{ fontSize: 11 }}>
                    {modal.result.created.find((c) => !c.emailSent)?.emailError}
                  </code>
                </div>
              )}

              {modal.cleanup && (
                <div
                  style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 12,
                    fontSize: 12,
                    color: '#065f46',
                  }}
                >
                  ✓ Cleanup freed {modal.cleanup.summary.cleaned} orphan{' '}
                  {modal.cleanup.summary.cleaned === 1 ? 'account' : 'accounts'} (
                  {modal.cleanup.cleaned.map((c) => c.email).join(', ')}) — retried the
                  create immediately.
                </div>
              )}

              {modal.result.skipped.length > 0 && (
                <details style={{ marginBottom: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: '#94a3b8' }}>
                    {modal.result.skipped.length} skipped attendees
                  </summary>
                  <ul style={{ margin: '8px 0 0 16px', fontSize: 12, color: '#64748b' }}>
                    {modal.result.skipped.map((s) => (
                      <li key={s.attendeeId}>
                        {s.attendeeId.slice(0, 8)}… — {s.reason.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {modal.result.created.length > 0 && (
                <div
                  style={{
                    background: '#f1f5f9',
                    borderRadius: 8,
                    padding: 12,
                    maxHeight: 200,
                    overflow: 'auto',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    marginBottom: 12,
                  }}
                >
                  {modal.result.created.map((e) => (
                    <div
                      key={e.attendeeId}
                      style={{
                        marginBottom: 6,
                        paddingLeft: 4,
                        borderLeft: e.emailSent ? 'none' : '3px solid #f59e0b',
                      }}
                    >
                      <strong>
                        {e.email}{' '}
                        {!e.emailSent && (
                          <span
                            style={{
                              color: '#b45309',
                              fontSize: 11,
                              fontFamily: 'sans-serif',
                            }}
                            title={e.emailError}
                          >
                            ⚠ email not sent
                          </span>
                        )}
                      </strong>
                      <br />
                      <span style={{ color: '#64748b', wordBreak: 'break-all' }}>{e.setupUrl}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* "Free emails & retry" — only show when the only reason
                    anyone was skipped is email_taken, AND no cleanup has
                    run yet for this modal (otherwise the banner above already
                    shows the result). */}
                {modal.result.summary.created === 0 &&
                  !modal.cleanup &&
                  modal.result.skipped.length > 0 &&
                  modal.result.skipped.every((s) => s.reason === 'email_taken') && (
                    <button
                      id="cleanup-and-retry-btn"
                      onClick={onCleanupAndRetry}
                      disabled={cleanupBusy}
                      style={{
                        ...btnStyle,
                        background: cleanupBusy ? '#94a3b8' : '#0f766e',
                        cursor: cleanupBusy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {cleanupBusy ? 'Cleaning up…' : 'Free emails & retry'}
                    </button>
                  )}
                <button
                  id="bulk-download-csv"
                  onClick={() => downloadBulkCsv(modal.result)}
                  style={btnStyle}
                >
                  ⬇ Download CSV
                </button>
                <button
                  id="bulk-copy-all"
                  onClick={() => {
                    const text = modal.result.created
                      .map((e) => `${e.email}: ${e.setupUrl}`)
                      .join('\n');
                    copyToClipboard(text, 'All links copied!');
                  }}
                  style={{ ...btnStyle, background: '#475569' }}
                >
                  {copyFeedback ?? '📋 Copy all'}
                </button>
                <button onClick={closeModal} style={{ ...btnStyle, background: '#f1f5f9', color: '#1e293b' }}>
                  Close
                </button>
              </div>
            </>
          )}

          {modal.kind === 'bulk-delete-confirm' && (
            <>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#dc2626' }}>
                Delete {modal.ids.length} attendees?
              </h2>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                Soft-delete only. Attendance records and event rosters are kept for
                audit; the attendees disappear from the active roster and can be
                re-added later with the same identifier.
              </p>
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: 12,
                  maxHeight: 240,
                  overflow: 'auto',
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                {list
                  ?.filter((a) => modal.ids.includes(a.id))
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '2px 0',
                      }}
                    >
                      <span>{a.fullName}</span>
                      <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                        {a.identifier}
                      </span>
                    </div>
                  ))}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={closeModal}
                  disabled={deleteBusy}
                  style={{ ...btnStyle, background: '#f1f5f9', color: '#1e293b' }}
                >
                  Cancel
                </button>
                <button
                  id="bulk-delete-confirm-btn"
                  onClick={confirmBulkDelete}
                  disabled={deleteBusy}
                  style={{
                    ...btnStyle,
                    background: '#dc2626',
                    opacity: deleteBusy ? 0.6 : 1,
                    cursor: deleteBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deleteBusy ? 'Deleting…' : `Delete ${modal.ids.length}`}
                </button>
              </div>
            </>
          )}

          {modal.kind === 'bulk-delete-result' && (
            <>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#dc2626' }}>
                {modal.result.summary.deleted} Deleted
              </h2>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                {modal.result.summary.deleted} attendee(s) soft-deleted,{' '}
                {modal.result.summary.skipped} skipped out of{' '}
                {modal.result.summary.requested} requested.
              </p>

              {modal.result.deleted.length > 0 && (
                <details open style={{ marginBottom: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: '#475569' }}>
                    {modal.result.deleted.length} deleted
                  </summary>
                  <ul style={{ margin: '8px 0 0 16px', fontSize: 12, color: '#1e293b' }}>
                    {modal.result.deleted.map((d) => (
                      <li key={d.attendeeId}>
                        <strong>{d.fullName}</strong>{' '}
                        <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                          ({d.identifier})
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {modal.result.skipped.length > 0 && (
                <details style={{ marginBottom: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: '#94a3b8' }}>
                    {modal.result.skipped.length} skipped
                  </summary>
                  <ul style={{ margin: '8px 0 0 16px', fontSize: 12, color: '#64748b' }}>
                    {modal.result.skipped.map((s) => (
                      <li key={s.attendeeId}>
                        {s.attendeeId.slice(0, 8)}… — {s.reason.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={closeModal} style={btnStyle}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <>
      {renderModal()}
      <main style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
        <h1 style={{ margin: '0 0 16px', fontSize: 22 }}>Attendees ({list.length})</h1>

        {/* Create form */}
        <form
          onSubmit={onCreate}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr 2fr auto',
            gap: 8,
            alignItems: 'end',
            marginBottom: 24,
            padding: 12,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
          }}
        >
          <label style={fld}>
            Identifier
            <input
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              required
              style={inp}
            />
          </label>
          <label style={fld}>
            Full name
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
              style={inp}
            />
          </label>
          <label style={fld}>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              style={inp}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#1e293b',
              color: 'white',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {busy ? '…' : '+ Add'}
          </button>
        </form>

        {/* Excel/CSV import */}
        <div style={{ marginBottom: 16, padding: 12, background: '#f1f5f9', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <strong>Bulk import:</strong> upload a CSV or Excel file with columns <code>identifier, fullName, email</code>.
          </div>
          <button
            type="button"
            onClick={downloadSampleExcel}
            style={{
              background: 'none',
              border: 'none',
              color: '#0f766e',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontWeight: 600,
              padding: 0,
              fontSize: 13,
            }}
          >
            Download Sample Excel
          </button>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={onImport} />
        </div>

        {/* Toolbar: filter + bulk action */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            <input
              type="search"
              placeholder={`Filter ${list.length} attendees…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ ...inp, maxWidth: 220 }}
            />
            <input
              type="text"
              placeholder="Bulk select by identifiers (comma/space/newline separated)…"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              style={{ ...inp, maxWidth: 380 }}
            />
            <button
              type="button"
              onClick={onBulkSelect}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              Select
            </button>
          </div>
          {someSelected && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                id="bulk-create-accounts-btn"
                onClick={onBulkCreateAccounts}
                disabled={bulkBusy}
                style={{
                  ...btnStyle,
                  opacity: bulkBusy ? 0.6 : 1,
                  cursor: bulkBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {bulkBusy ? 'Creating…' : `Create accounts (${selected.size})`}
              </button>
              <button
                id="bulk-delete-btn"
                onClick={onAskBulkDelete}
                disabled={deleteBusy}
                style={{
                  ...btnStyle,
                  background: '#dc2626',
                  opacity: deleteBusy ? 0.6 : 1,
                  cursor: deleteBusy ? 'not-allowed' : 'pointer',
                }}
              >
                Delete ({selected.size})
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ ...th, width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  id="select-all-checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  title={allVisibleSelected ? 'Deselect all' : 'Select all'}
                />
              </th>
              <th style={th}>Identifier</th>
              <th style={th}>Full name</th>
              <th style={th}>Email</th>
              <th style={th}>Account</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ ...td, textAlign: 'center', width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                  />
                </td>
                <td style={td}>{a.identifier}</td>
                <td style={td}>{a.fullName}</td>
                <td style={td}>{a.email ?? '—'}</td>
                <td style={td}>
                  {a.hasAccount ? (
                    <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 600 }}>✓ Active</span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>No account</span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {!a.hasAccount && (
                    <button
                      onClick={() => onCreateAccount(a)}
                      disabled={busy}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 5,
                        border: '1px solid #cbd5e1',
                        background: 'white',
                        fontSize: 12,
                        cursor: 'pointer',
                        color: '#1e293b',
                      }}
                    >
                      Create account
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};

const fld: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#475569',
};

const th: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  color: '#64748b',
  fontWeight: 600,
  textTransform: 'uppercase',
};

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14 };

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  background: '#1e293b',
  color: 'white',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};
