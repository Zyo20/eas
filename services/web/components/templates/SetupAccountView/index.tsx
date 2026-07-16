'use client';

import React, { Suspense } from 'react';
import { useHooks } from './hooks';

import type { SetupAccountViewProps } from './types';
export type { SetupAccountViewProps } from './types';

function SetupAccountFormContent(props: SetupAccountViewProps) {
  const {
    state,
    userInfo,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    onSubmit,
  } = useHooks(props);

  if (state === 'loading') {
    return (
      <div className="eas-setup-card-content">
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
          Verifying your secure invitation link...
        </p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="eas-setup-card-content" style={{ textAlign: 'center' }}>
        <div className="eas-setup-icon error">⚠</div>
        <h2 className="eas-setup-title">Setup Link Error</h2>
        <p style={{ color: 'var(--color-danger-text)', fontSize: '14px', margin: '0 0 24px' }}>{error}</p>
        <a href="/login" className="eas-btn-secondary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
          Go to Login
        </a>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="eas-setup-card-content" style={{ textAlign: 'center' }}>
        <div className="eas-setup-icon success">✓</div>
        <h2 className="eas-setup-title">Password Verified</h2>
        <p style={{ color: 'var(--color-success-text)', fontSize: '14px', margin: 0 }}>
          Your password has been successfully configured. Redirecting you to login...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="eas-setup-card-content" id="eas-setup-account-form">
      <h2 className="eas-setup-title">Welcome, {userInfo?.name}!</h2>
      <p className="eas-setup-subtitle">
        You've been invited to join the attendance dashboard. Pick a secure password to activate your coordinator account.
      </p>

      <label className="eas-login-label">
        Email Address
        <input
          type="email"
          value={userInfo?.email ?? ''}
          readOnly
          className="eas-input"
          style={{ background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'not-allowed', border: '1px dashed var(--border-color)' }}
        />
      </label>

      <label className="eas-login-label">
        New Password
        <input
          id="setup-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="eas-input"
          disabled={state === 'submitting'}
        />
      </label>

      <label className="eas-login-label">
        Confirm Password
        <input
          id="setup-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Verify password"
          className="eas-input"
          disabled={state === 'submitting'}
        />
      </label>

      {error && <div style={{ color: 'var(--color-danger-text)', fontSize: '13px', margin: '4px 0' }}>{error}</div>}

      <button
        type="submit"
        id="setup-submit"
        disabled={state === 'submitting'}
        className="eas-btn-primary"
        style={{ width: '100%', justifyContent: 'center', minHeight: '48px', marginTop: '12px' }}
      >
        {state === 'submitting' ? (
          <span>Setting up account...</span>
        ) : (
          <span>Activate Account</span>
        )}
      </button>
    </form>
  );
}

export default function SetupAccountView(props: SetupAccountViewProps) {
  return (
    <main className="eas-setup-page" id="eas-setup-account-page">
      <style dangerouslySetInnerHTML={{ __html: `
        .eas-setup-page {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 50% 50%, #100b26 0%, #060410 100%);
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #f8fafc;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .eas-setup-glow-1 {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(99, 102, 241, 0) 70%);
          top: -100px;
          left: -100px;
          pointer-events: none;
        }

        .eas-setup-glow-2 {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(236, 72, 153, 0.08) 0%, rgba(236, 72, 153, 0) 70%);
          bottom: -100px;
          right: -100px;
          pointer-events: none;
        }

        .eas-setup-card {
          width: 100%;
          max-width: 440px;
          background: rgba(13, 10, 30, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.07);
          box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.7), 
                      inset 0 1px 1px rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 36px 32px;
          position: relative;
          z-index: 10;
          animation: eas-card-appear 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-setup-card-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .eas-setup-title {
          font-family: 'Outfit', sans-serif;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text-main);
          margin: 0;
        }

        .eas-setup-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.5;
          margin-top: -8px;
          margin-bottom: 8px;
        }

        .eas-setup-icon {
          width: 54px;
          height: 54px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 800;
          margin: 0 auto 16px;
        }

        .eas-setup-icon.success {
          background: rgba(16, 185, 129, 0.15);
          border: 1.5px solid #10b981;
          color: #10b981;
        }

        .eas-setup-icon.error {
          background: rgba(239, 68, 68, 0.15);
          border: 1.5px solid #ef4444;
          color: #ef4444;
        }
      ` }} />

      <div className="eas-setup-glow-1" aria-hidden="true" />
      <div className="eas-setup-glow-2" aria-hidden="true" />

      <div className="eas-setup-card" id="eas-setup-card">
        <Suspense fallback={
          <div className="eas-setup-card-content">
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
              Loading setup details...
            </p>
          </div>
        }>
          <SetupAccountFormContent />
        </Suspense>
      </div>
    </main>
  );
}
