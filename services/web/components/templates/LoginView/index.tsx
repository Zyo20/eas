'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useHooks } from './hooks';

import type { LoginViewProps } from './types';
export type { LoginViewProps } from './types';

function LoginFormContent(props: LoginViewProps) {
  const {
    email,
    setEmail,
    password,
    setPassword,
    error,
    busy,
    onSubmit,
  } = useHooks(props);

  return (
    <form onSubmit={onSubmit} className="eas-login-form" id="eas-login-form">
      {error && (
        <div className="eas-login-error-box" role="alert" id="eas-login-error">
          <span>{error}</span>
        </div>
      )}

      <label className="eas-login-label">
        Email Address
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          placeholder="e.g. admin@llcc.edu"
          className="eas-login-input"
          id="eas-login-email"
          disabled={busy}
        />
      </label>

      <label className="eas-login-label">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="eas-login-input"
          id="eas-login-password"
          disabled={busy}
        />
      </label>

      <button
        type="submit"
        disabled={busy || !email || !password}
        className="eas-login-btn-submit"
        id="eas-login-submit"
      >
        {busy ? (
          <>
            <span className="eas-login-loader" />
            <span>Signing in...</span>
          </>
        ) : (
          'Sign In'
        )}
      </button>
    </form>
  );
}

export default function LoginView(props: LoginViewProps) {
  return (
    <main className="eas-login-container" id="eas-login-page">
      <style dangerouslySetInnerHTML={{ __html: `
        .eas-login-container {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 50% 50%, #120e2e 0%, #080614 100%);
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #f8fafc;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .eas-login-glow-1 {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0) 70%);
          top: -100px;
          left: -100px;
          animation: eas-glow-move 25s infinite alternate ease-in-out;
          pointer-events: none;
        }

        .eas-login-glow-2 {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, rgba(168, 85, 247, 0) 70%);
          bottom: -150px;
          right: -100px;
          animation: eas-glow-move 30s infinite alternate ease-in-out;
          pointer-events: none;
        }

        .eas-login-card {
          width: 100%;
          max-width: 420px;
          background: rgba(13, 10, 30, 0.65);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.07);
          box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.7), 
                      0 0 80px -10px rgba(99, 102, 241, 0.12),
                      inset 0 1px 1px rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 40px;
          display: flex;
          flex-direction: column;
          gap: 28px;
          position: relative;
          z-index: 10;
          animation: eas-card-appear 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-login-header {
          text-align: center;
        }

        .eas-login-title {
          margin: 0;
          font-family: 'Outfit', sans-serif;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: -0.75px;
          background: linear-gradient(135deg, #a5b4fc 0%, #d8b4fe 50%, #f472b6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .eas-login-subtitle {
          margin: 10px 0 0 0;
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.5;
        }

        .eas-login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .eas-login-label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #cbd5e1;
        }

        .eas-login-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(5, 5, 15, 0.45);
          color: #f8fafc;
          font-size: 14px;
          outline: none;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-login-input:hover {
          border-color: rgba(255, 255, 255, 0.22);
          background: rgba(5, 5, 15, 0.6);
        }

        .eas-login-input:focus {
          border-color: #818cf8;
          box-shadow: 0 0 0 1px #818cf8, 0 0 16px rgba(129, 140, 248, 0.35);
          background: rgba(5, 5, 15, 0.75);
        }

        .eas-login-btn-submit {
          padding: 14px 24px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
          background-size: 200% auto;
          color: white;
          font-family: 'Outfit', sans-serif;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.5px;
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          margin-top: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .eas-login-btn-submit:hover:not(:disabled) {
          background-position: right center;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(168, 85, 247, 0.45);
        }

        .eas-login-btn-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .eas-login-btn-submit:disabled {
          background: #334155;
          color: #64748b;
          box-shadow: none;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .eas-login-error-box {
          padding: 12px 16px;
          border-radius: 10px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #fca5a5;
          font-size: 13px;
          line-height: 1.5;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          animation: eas-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }

        .eas-login-footer {
          text-align: center;
          margin-top: 8px;
        }

        .eas-login-footer-text {
          margin: 0;
          font-size: 13px;
          color: #94a3b8;
        }

        .eas-login-link {
          color: #a5b4fc;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s;
          position: relative;
        }

        .eas-login-link:hover {
          color: #c084fc;
        }

        .eas-login-link::after {
          content: '';
          position: absolute;
          width: 100%;
          transform: scaleX(0);
          height: 1px;
          bottom: -2px;
          left: 0;
          background-color: #c084fc;
          transform-origin: bottom right;
          transition: transform 0.25s ease-out;
        }

        .eas-login-link:hover::after {
          transform: scaleX(1);
          transform-origin: bottom left;
        }

        .eas-login-loader {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: eas-spin 0.8s infinite linear;
        }
      ` }} />

      <div className="eas-login-glow-1" aria-hidden="true" />
      <div className="eas-login-glow-2" aria-hidden="true" />

      <div className="eas-login-card" id="eas-login-card">
        <header className="eas-login-header">
          <h1 className="eas-login-title">Sign In</h1>
          <p className="eas-login-subtitle">Access your Event Attendance System dashboard</p>
        </header>

        <Suspense fallback={<p style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>Loading Form...</p>}>
          <LoginFormContent />
        </Suspense>

        <footer className="eas-login-footer">
          <p className="eas-login-footer-text">
            Don't have an organization?{' '}
            <Link href="/register" className="eas-login-link" id="eas-login-signup-link">
              Register here
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
