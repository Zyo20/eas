'use client';

import React from 'react';
import Link from 'next/link';
import DashboardLayout from '../DashboardLayout';
import { useHooks } from './hooks';

import type { EventDetailViewProps } from './types';
export type { EventDetailViewProps } from './types';

export default function EventDetailView(props: EventDetailViewProps) {
  const {
    event,
    summary,
    missed,
    rawMissed,
    attendees,
    flagged,
    flaggedCount,
    filter,
    setFilter,
    manual,
    setManual,
    msg,
    err,
    loading,
    onClose,
    onManualCheckIn,
    onDelete,
    onDownloadQr,
    getScannerUrl,
  } = useHooks(props);

  if (loading && !event) {
    return (
      <DashboardLayout title="Event Details">
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '48px 0' }}>
          Loading event specifications...
        </div>
      </DashboardLayout>
    );
  }

  if (err && !event) {
    return (
      <DashboardLayout title="Error">
        <div style={{ color: 'var(--color-danger)', textAlign: 'center', padding: '48px 0', fontSize: 16 }}>
          {err}
        </div>
      </DashboardLayout>
    );
  }

  if (!event || !summary) return null;

  return (
    <DashboardLayout title="Event Details">
      <style dangerouslySetInnerHTML={{ __html: `
        .eas-detail-back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
          text-decoration: none;
          font-size: 13px;
          transition: color 0.2s;
        }

        .eas-detail-back-link:hover {
          color: var(--text-main);
        }

        .eas-detail-header-panel {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 20px;
          margin-top: 8px;
          animation: eas-card-appear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-detail-title-block {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .eas-detail-event-title {
          font-family: 'Outfit', sans-serif;
          font-size: 26px;
          font-weight: 800;
          color: var(--text-main);
          letter-spacing: -0.5px;
        }

        .eas-detail-meta-text {
          font-size: 13px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .eas-detail-geofence-text {
          font-size: 12px;
          color: var(--color-primary);
          font-family: var(--font-mono);
          margin-top: 4px;
        }

        .eas-detail-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        /* Stats Grid */
        .eas-detail-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px;
          margin-top: 24px;
          animation: eas-card-appear 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-detail-stat-box {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
          box-shadow: var(--shadow-sm);
        }

        .eas-detail-stat-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .eas-detail-stat-val {
          font-family: 'Outfit', sans-serif;
          font-size: 28px;
          font-weight: 800;
          color: var(--text-main);
          margin-top: 4px;
        }

        .eas-detail-stat-hint {
          font-size: 11px;
          color: var(--color-warning-text);
          margin-top: 4px;
          font-weight: 500;
        }

        /* Progress Bar wrapper */
        .eas-detail-progress-container {
          margin-top: 16px;
          height: 10px;
          background: var(--border-color);
          border-radius: 5px;
          overflow: hidden;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .eas-detail-progress-bar {
          height: 100%;
          transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          border-radius: 5px;
          box-shadow: 0 0 8px var(--color-primary-glow);
        }

        /* Columns Grid Layout */
        .eas-detail-layout-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 24px;
          animation: eas-card-appear 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @media (max-width: 768px) {
          .eas-detail-layout-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Lists and Panel Cards */
        .eas-detail-panel-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 24px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .eas-panel-title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 12px;
        }

        .eas-panel-title {
          font-family: 'Outfit', sans-serif;
          font-size: 16px;
          font-weight: 700;
          color: var(--text-main);
        }

        .eas-missed-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 8px;
          max-height: 320px;
          overflow-y: auto;
        }

        .eas-missed-item {
          padding: 8px 12px;
          background: var(--color-warning-bg);
          border: 1px solid var(--color-warning-border);
          border-radius: 8px;
          font-size: 13px;
          color: var(--color-warning-text);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .eas-missed-id {
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 11px;
        }

        /* Geofence violation logs */
        .eas-flagged-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 220px;
          overflow-y: auto;
        }

        .eas-flagged-item {
          padding: 10px 14px;
          background: var(--color-danger-bg);
          border: 1px solid var(--color-danger-border);
          border-radius: 8px;
          font-size: 13px;
          color: var(--color-danger-text);
        }

        .eas-flagged-name {
          font-weight: 700;
          font-size: 14px;
        }

        .eas-flagged-detail {
          font-size: 11px;
          opacity: 0.85;
          margin-top: 4px;
        }

        /* Form alignment */
        .eas-manual-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .eas-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        @media (max-width: 480px) {
          .eas-form-row {
            grid-template-columns: 1fr;
          }
        }
      ` }} />

      {/* Back button */}
      <Link href="/dashboard" className="eas-detail-back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>Back to Events</span>
      </Link>

      {/* Header Info */}
      <header className="eas-detail-header-panel">
        <div className="eas-detail-title-block">
          <h1 className="eas-detail-event-title">{event.name}</h1>
          <div className="eas-detail-meta-text">
            <span>📅 {new Date(event.startsAt).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span>→</span>
            <span>{new Date(event.endsAt).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            {event.location && <span>· 📍 {event.location}</span>}
          </div>
          {event.locationLat != null && event.locationLng != null && (
            <div className="eas-detail-geofence-text">
              📡 GEOFENCE ACTIVE: {event.locationLat.toFixed(6)}, {event.locationLng.toFixed(6)} (Radius: {event.geofenceRadiusM ?? 50}m)
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="eas-detail-actions">
          <a
            href={getScannerUrl(event.id)}
            target="_blank"
            rel="noreferrer"
            className="eas-btn-primary"
            style={{ textDecoration: 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <rect x="7" y="7" width="3" height="3" />
              <rect x="14" y="7" width="3" height="3" />
              <rect x="7" y="14" width="3" height="3" />
              <rect x="14" y="14" width="3" height="3" />
            </svg>
            <span>Open Scanner</span>
          </a>

          <button onClick={onDownloadQr} className="eas-btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download QR PDF</span>
          </button>

          {event.status !== 'CLOSED' && (
            <button onClick={onClose} className="eas-btn-secondary" id="eas-close-event-btn">
              <span>Close Event</span>
            </button>
          )}

          <button
            onClick={onDelete}
            className="eas-btn-secondary"
            id="eas-delete-event-btn"
            style={{ borderColor: 'rgba(239, 68, 68, 0.3)', background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}
          >
            <span>Delete Event</span>
          </button>
        </div>
      </header>

      {/* Progress Cards */}
      <section className="eas-detail-stats-grid">
        <div className="eas-detail-stat-box">
          <div className="eas-detail-stat-label">Total Roster</div>
          <div className="eas-detail-stat-val" style={{ color: 'var(--text-main)' }}>{summary.total}</div>
        </div>

        <div className="eas-detail-stat-box">
          <div className="eas-detail-stat-label">Checked In</div>
          <div className="eas-detail-stat-val" style={{ color: 'var(--color-success-text)' }}>{summary.checkedIn}</div>
        </div>

        <div className="eas-detail-stat-box">
          <div className="eas-detail-stat-label">Absent / Missed</div>
          <div className="eas-detail-stat-val" style={{ color: summary.remaining === 0 ? 'var(--color-success-text)' : 'var(--color-warning-text)' }}>
            {summary.remaining}
          </div>
        </div>

        <div className="eas-detail-stat-box">
          <div className="eas-detail-stat-label">Attendance Rate</div>
          <div className="eas-detail-stat-val" style={{ color: 'var(--color-primary)' }}>{summary.percent}%</div>
        </div>

        <div className="eas-detail-stat-box">
          <div className="eas-detail-stat-label">Geofence Flagged</div>
          <div className="eas-detail-stat-val" style={{ color: flaggedCount > 0 ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>
            {flaggedCount}
          </div>
          {flaggedCount > 0 && <div className="eas-detail-stat-hint">⚠ Out of bounds scans</div>}
        </div>
      </section>

      {/* Progress Bar */}
      <div className="eas-detail-progress-container">
        <div
          className="eas-detail-progress-bar"
          style={{
            width: `${summary.percent}%`,
            background: summary.percent === 100 ? 'var(--color-success)' : 'var(--color-primary)'
          }}
        />
      </div>

      {/* Grid columns */}
      <div className="eas-detail-layout-grid">
        {/* Left Column: Who hasn't arrived */}
        <section className="eas-detail-panel-card">
          <header className="eas-panel-title-bar">
            <h2 className="eas-panel-title">Who hasn't arrived ({missed.length})</h2>
            <input
              type="text"
              placeholder="Search..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="eas-input"
              style={{ width: '120px', padding: '6px 10px', fontSize: '12px' }}
            />
          </header>

          {missed.length === 0 ? (
            <div style={{ color: 'var(--color-success-text)', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
              Everyone is present! 🎉
            </div>
          ) : (
            <ul className="eas-missed-list">
              {missed.map((m) => (
                <li key={m.id} className="eas-missed-item">
                  <span className="eas-missed-id">{m.identifier}</span>
                  <span style={{ fontWeight: 600 }}>{m.fullName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right Column: Alerts and manual override */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Flagged logs */}
          {flagged.length > 0 && (
            <section className="eas-detail-panel-card" style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
              <header className="eas-panel-title-bar" style={{ borderBottomColor: 'rgba(245, 158, 11, 0.2)' }}>
                <h2 className="eas-panel-title" style={{ color: 'var(--color-warning-text)' }}>⚠ Geofence Flagged Scans ({flagged.length})</h2>
              </header>

              <ul className="eas-flagged-list">
                {flagged.map((f) => (
                  <li key={f.id} className="eas-flagged-item">
                    <div className="eas-flagged-name">{f.attendee.identifier} {f.attendee.fullName}</div>
                    <div className="eas-flagged-detail">
                      Scanned at: {new Date(f.scannedAt).toLocaleTimeString()} · Source: {f.source}
                    </div>
                    {f.distanceM !== null && (
                      <div className="eas-flagged-detail" style={{ fontWeight: 600 }}>
                        Distance: {Math.round(f.distanceM)}m from center (Radius check failed)
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Manual check in form */}
          <section className="eas-detail-panel-card">
            <header className="eas-panel-title-bar">
              <h2 className="eas-panel-title">Manual Check-In Override</h2>
            </header>

            <form onSubmit={onManualCheckIn} className="eas-manual-form" id="eas-manual-checkin-form">
              <div className="eas-form-row">
                <label className="eas-login-label" style={{ color: 'var(--text-muted)' }}>
                  Select Attendee
                  <select
                    value={manual.attendeeId}
                    onChange={(e) => setManual({ ...manual, attendeeId: e.target.value })}
                    className="eas-input"
                    id="eas-manual-attendee-select"
                    style={{ height: '45px' }}
                  >
                    <option value="">— select —</option>
                    {attendees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.identifier} - {a.fullName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="eas-login-label" style={{ color: 'var(--text-muted)' }}>
                  Note / Justification
                  <input
                    type="text"
                    value={manual.note}
                    onChange={(e) => setManual({ ...manual, note: e.target.value })}
                    placeholder="e.g. Off-site permission"
                    className="eas-input"
                    id="eas-manual-note-input"
                    style={{ height: '45px' }}
                  />
                </label>
              </div>

              {msg && <div style={{ color: 'var(--color-success-text)', fontSize: '13px' }} id="eas-manual-checkin-success">{msg}</div>}
              {err && <div style={{ color: 'var(--color-danger-text)', fontSize: '13px' }} id="eas-manual-checkin-error">{err}</div>}

              <button
                type="submit"
                disabled={!manual.attendeeId}
                className="eas-btn-primary"
                id="eas-manual-submit-btn"
                style={{ alignSelf: 'flex-end', minHeight: '44px' }}
              >
                <span>Override Check-In</span>
              </button>
            </form>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
