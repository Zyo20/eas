'use client';

import { useEffect, useState, FormEvent } from 'react';
import { api, type Attendee } from '@/lib/api';

export default function AttendeesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [list, setList] = useState<Attendee[] | null>(null);
  const [form, setForm] = useState({ identifier: '', fullName: '', email: '' });
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

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

  if (err) return <main style={{ padding: 24, color: '#dc2626' }}>{err}</main>;
  if (list === null) return <main style={{ padding: 24, color: '#64748b' }}>Loading…</main>;

  const filtered = filter
    ? list.filter((a) => a.fullName.toLowerCase().includes(filter.toLowerCase()) || a.identifier.includes(filter))
    : list;

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1 style={{ margin: '0 0 16px', fontSize: 22 }}>Attendees ({list.length})</h1>

      {/* Create form */}
      <form onSubmit={onCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr auto', gap: 8, alignItems: 'end', marginBottom: 24, padding: 12, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <label style={fld}>Identifier<input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} required style={inp} /></label>
        <label style={fld}>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required style={inp} /></label>
        <label style={fld}>Email (optional)<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inp} /></label>
        <button type="submit" disabled={busy} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1e293b', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {busy ? '…' : '+ Add'}
        </button>
      </form>

      {/* CSV import */}
      <div style={{ marginBottom: 16, padding: 12, background: '#f1f5f9', borderRadius: 8, fontSize: 13 }}>
        <strong>Bulk import:</strong> upload a CSV with columns <code>identifier, fullName, email</code>.
        <input type="file" accept=".csv" onChange={onImport} style={{ marginLeft: 12 }} />
      </div>

      {/* List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <input
          type="search"
          placeholder={`Filter ${list.length} attendees…`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ ...inp, maxWidth: 300 }}
        />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
            <th style={th}>Identifier</th>
            <th style={th}>Full name</th>
            <th style={th}>Email</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((a) => (
            <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={td}>{a.identifier}</td>
              <td style={td}>{a.fullName}</td>
              <td style={td}>{a.email ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, width: '100%', boxSizing: 'border-box' };
const fld: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' };
const th: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14 };
