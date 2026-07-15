'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken, getToken, type AuthUser } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (t) {
      // Best-effort role peek. If it fails, fall through to the login form.
      fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${t}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((user) => {
          if (!user) return;
          router.replace(user.role === 'attendee' ? '/me' : '/dashboard');
        })
        .catch(() => { /* stay on login */ });
    }
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
      setToken(token);
      // Role-aware redirect. Admins go to the dashboard; attendees go to their self-service portal.
      // /me works for both roles (returns AuthedUser), so the redirect is purely a UX hint.
      const dest = user.role === 'attendee' ? '/me' : '/dashboard';
      router.push(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>EAS</h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Sign in to check in attendees or view your events.</p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#475569' }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#475569' }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={inputStyle}
          />
        </label>
        {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '10px 16px',
            borderRadius: 6,
            border: 'none',
            background: busy ? '#94a3b8' : '#1e293b',
            color: 'white',
            fontWeight: 600,
            fontSize: 14,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: 'white',
  fontSize: 14,
};
