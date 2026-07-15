'use client';

import { useEffect, useState, useRef, FormEvent } from 'react';
import { api, type Attendee, bulkCreateAccounts, type BulkCreateAccountsResponse } from '@/lib/api';

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
  | { kind: 'bulk'; result: BulkCreateAccountsResponse; orgId: string; ids: string[] };

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
    const header = 'attendeeId,email,setupUrl';
    const rows = result.created.map(
      (e) => `"${e.attendeeId}","${e.email}","${e.setupUrl}"`,
    );
    const csv = [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'setup-links.csv';
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
              </p>

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
                    <div key={e.attendeeId} style={{ marginBottom: 6 }}>
                      <strong>{e.email}</strong>
                      <br />
                      <span style={{ color: '#64748b', wordBreak: 'break-all' }}>{e.setupUrl}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

        {/* CSV import */}
        <div style={{ marginBottom: 16, padding: 12, background: '#f1f5f9', borderRadius: 8, fontSize: 13 }}>
          <strong>Bulk import:</strong> upload a CSV with columns <code>identifier, fullName, email</code>.
          <input type="file" accept=".csv" onChange={onImport} style={{ marginLeft: 12 }} />
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
          <input
            type="search"
            placeholder={`Filter ${list.length} attendees…`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inp, maxWidth: 300 }}
          />
          {someSelected && (
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
