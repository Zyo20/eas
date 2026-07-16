'use client';

import React, { Suspense } from 'react';
import { useHooks } from './hooks';

export interface CheckInViewProps {}

function CheckInFormContent(props: CheckInViewProps) {
  const {
    preview,
    confirming,
    result,
    confirm,
  } = useHooks(props);

  if (!preview) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>Loading credentials...</div>;
  }

  if (!preview.ok) {
    const msg = preview.status === 'invalid_token'
      ? 'This QR code is invalid or expired. Please request a fresh one.'
      : 'Could not load your check-in credentials.';
    return (
      <div className="eas-checkin-error-section">
        <div className="eas-checkin-icon-status error">⚠</div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '16px 0 8px' }}>Verification Failed</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>{msg}</p>
      </div>
    );
  }

  if (result) {
    const isSuccess = result.status === 'checked_in' || result.status === 'already_checked_in';
    return (
      <div className="eas-checkin-result-section">
        <div className={`eas-checkin-icon-status ${isSuccess ? 'success' : 'error'}`}>
          {isSuccess ? '✓' : '✗'}
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '16px 0 8px', color: isSuccess ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>
          {result.message}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>{preview.event.name}</p>
      </div>
    );
  }

  return (
    <div className="eas-checkin-prompt-section">
      <span className="eas-checkin-meta-header">Confirm Check-In Session</span>
      <h2 className="eas-checkin-event-title">{preview.event.name}</h2>
      
      <div className="eas-checkin-info-card">
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Attendee</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
          {preview.attendee.fullName}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
          {preview.attendee.identifier}
        </div>
      </div>

      {!preview.onRoster && (
        <div className="eas-checkin-alert warning">
          <span>⚠ You're not mapped to the roster. A facilitator can override scan on-site.</span>
        </div>
      )}

      {preview.alreadyCheckedIn && (
        <div className="eas-checkin-alert success">
          <span>✓ You were already checked in earlier. Welcome back!</span>
        </div>
      )}

      <button
        onClick={confirm}
        disabled={confirming}
        className="eas-btn-primary"
        style={{ width: '100%', justifyContent: 'center', minHeight: '50px', fontSize: '16px', marginTop: '24px' }}
        id="eas-confirm-checkin-btn"
      >
        {confirming ? 'Checking you in...' : 'Yes, Check Me In'}
      </button>

      <p style={{ marginTop: '24px', fontSize: '11px', color: 'var(--text-muted)' }}>
        Not you? Close this browser tab and ask a check-in scanner assistant.
      </p>
    </div>
  );
}

export default function CheckInView(props: CheckInViewProps) {
  return (
    <main className="eas-checkin-container" id="eas-checkin-page">
      <style dangerouslySetInnerHTML={{ __html: `
        .eas-checkin-container {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 50% 50%, #100b26 0%, #060410 100%);
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #f8fafc;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .eas-checkin-glow-1 {
          position: absolute;
          width: 450px;
          height: 450px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(99, 102, 241, 0) 70%);
          top: -80px;
          left: -80px;
          animation: eas-glow-move 20s infinite alternate ease-in-out;
          pointer-events: none;
        }

        .eas-checkin-glow-2 {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(236, 72, 153, 0.08) 0%, rgba(236, 72, 153, 0) 70%);
          bottom: -100px;
          right: -80px;
          animation: eas-glow-move 25s infinite alternate ease-in-out;
          pointer-events: none;
        }

        .eas-checkin-card {
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
          text-align: center;
          animation: eas-card-appear 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-checkin-icon-status {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          font-weight: 800;
          margin: 0 auto 16px;
        }

        .eas-checkin-icon-status.success {
          background: rgba(16, 185, 129, 0.15);
          border: 1.5px solid #10b981;
          color: #10b981;
        }

        .eas-checkin-icon-status.error {
          background: rgba(239, 68, 68, 0.15);
          border: 1.5px solid #ef4444;
          color: #ef4444;
        }

        .eas-checkin-meta-header {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .eas-checkin-event-title {
          font-family: 'Outfit', sans-serif;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text-main);
          margin: 8px 0 20px 0;
          line-height: 1.25;
        }

        .eas-checkin-info-card {
          background: var(--bg-main);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
          text-align: left;
          margin-bottom: 16px;
        }

        .eas-checkin-alert {
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 12px;
          text-align: left;
          margin-top: 10px;
          line-height: 1.4;
        }

        .eas-checkin-alert.warning {
          background: var(--color-warning-bg);
          border: 1px solid var(--color-warning-border);
          color: var(--color-warning-text);
        }

        .eas-checkin-alert.success {
          background: var(--color-success-bg);
          border: 1px solid var(--color-success-border);
          color: var(--color-success-text);
        }
      ` }} />

      <div className="eas-checkin-glow-1" aria-hidden="true" />
      <div className="eas-checkin-glow-2" aria-hidden="true" />

      <div className="eas-checkin-card" id="eas-checkin-card">
        <Suspense fallback={<p style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>Loading Check-In Details...</p>}>
          <CheckInFormContent />
        </Suspense>
      </div>
    </main>
  );
}
