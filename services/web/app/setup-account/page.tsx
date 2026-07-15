'use client';

import { Suspense } from 'react';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSetupInfo, consumeSetupToken, ApiError } from '@/lib/api';

type PageState = 'loading' | 'ready' | 'submitting' | 'error' | 'done';

function SetupAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<PageState>('loading');
  const [userInfo, setUserInfo] = useState<{ email: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No setup token found in the URL. Please check the link you received.');
      setState('error');
      return;
    }

    (async () => {
      try {
        const info = await getSetupInfo(token);
        setUserInfo(info);
        setState('ready');
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          setError('This setup link has already been used. Ask your admin for a new one.');
        } else if (err instanceof ApiError && err.status === 401) {
          setError('This setup link has expired (links are valid for 7 days). Ask your admin for a new one.');
        } else {
          setError('Invalid setup link. Please check the link you received.');
        }
        setState('error');
      }
    })();
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !userInfo) return;

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setState('submitting');
    setError(null);

    try {
      await consumeSetupToken(token, newPassword);
      setState('done');
      router.push(`/login?email=${encodeURIComponent(userInfo.email)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setError('This setup link has already been used. Ask your admin for a new one.');
      } else if (err instanceof ApiError && err.status === 401) {
        setError('This setup link has expired. Ask your admin for a new one.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
      setState('ready');
    }
  }

  if (state === 'loading') {
    return (
      <div style={cardStyle}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Verifying your setup link…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={cardStyle}>
        <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Setup Link Error</h1>
        <p style={{ color: '#dc2626', fontSize: 14, margin: '0 0 16px' }}>{error}</p>
        <a href="/login" style={{ color: '#1e293b', fontSize: 13, textDecoration: 'underline' }}>
          Go to login
        </a>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div style={cardStyle}>
        <p style={{ color: '#16a34a', fontSize: 14 }}>Password set! Redirecting to login…</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={cardStyle}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Welcome, {userInfo?.name}!</h1>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>
        You&apos;ve been invited to <strong>Event Attendance System</strong>. Pick a password to
        activate your account.
      </p>

      <label style={labelStyle}>
        Email
        <input
          type="email"
          value={userInfo?.email ?? ''}
          readOnly
          style={{ ...inputStyle, background: '#f1f5f9', color: '#64748b' }}
        />
      </label>

      <label style={labelStyle}>
        New Password
        <input
          id="setup-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Minimum 8 characters"
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        Confirm Password
        <input
          id="setup-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          style={inputStyle}
        />
      </label>

      {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

      <button
        type="submit"
        id="setup-submit"
        disabled={state === 'submitting'}
        style={{
          padding: '10px 16px',
          borderRadius: 6,
          border: 'none',
          background: state === 'submitting' ? '#94a3b8' : '#1e293b',
          color: 'white',
          fontWeight: 600,
          fontSize: 14,
          cursor: state === 'submitting' ? 'not-allowed' : 'pointer',
        }}
      >
        {state === 'submitting' ? 'Setting up…' : 'Activate Account'}
      </button>
    </form>
  );
}

export default function SetupAccountPage() {
  return (
    <main style={pageStyle}>
      <Suspense
        fallback={
          <div style={cardStyle}>
            <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
          </div>
        }
      >
        <SetupAccountContent />
      </Suspense>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: '#f8fafc',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 400,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 28,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  color: '#475569',
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: 'white',
  fontSize: 14,
  color: '#1e293b',
};
