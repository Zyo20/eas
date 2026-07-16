'use client';

import React from 'react';
import Link from 'next/link';
import DashboardLayout from '../DashboardLayout';
import { useHooks } from './hooks';
import type { MeViewProps } from './types';

export type { MyProfile, MyEvent, MyAttendanceRecord, QrPayload, MeViewProps } from './types';

export default function MeView(props: MeViewProps) {
  const {
    profile,
    events,
    attendance,
    err,
    qrModal,
    setQrModal,
    qrLoading,
    fetchQr,
    downloadQr,
    logout,
  } = useHooks(props);

  if (err && !profile) {
    return (
      <DashboardLayout title="My Account">
        <div style={{ padding: '24px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: '12px', color: 'var(--color-danger-text)', margin: '16px 0' }}>
          <h4>Failed to load profile context</h4>
          <p>{err}</p>
          <button onClick={logout} className="eas-btn-primary" style={{ marginTop: '12px' }}>
            Sign In Again
          </button>
        </div>
      </DashboardLayout>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout title="My Account">
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '48px 0' }}>
          Loading account profile details...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="My Account">
      <style dangerouslySetInnerHTML={{ __html: `
        /* Beautiful styled table */
        .eas-table-container {
          overflow-x: auto;
          width: 100%;
        }

        .eas-data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .eas-data-table th {
          padding: 12px 16px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border-color);
        }

        .eas-data-table tr {
          border-bottom: 1px solid var(--border-color);
          transition: background-color 0.2s ease;
        }

        .eas-data-table tr:hover {
          background: var(--bg-card-hover);
        }

        .eas-data-table td {
          padding: 16px;
          font-size: 14px;
          color: var(--text-main);
        }

        .eas-me-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 32px;
          margin-top: 16px;
          animation: eas-card-appear 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @media (max-width: 900px) {
          .eas-me-grid {
            grid-template-columns: 1fr;
          }
        }

        .eas-profile-sidebar {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 28px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          height: fit-content;
        }

        .eas-profile-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Outfit', sans-serif;
          font-weight: 800;
          font-size: 28px;
          color: white;
          margin-bottom: 16px;
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.25);
        }

        .eas-profile-name {
          font-family: 'Outfit', sans-serif;
          font-size: 20px;
          font-weight: 800;
          color: var(--text-main);
          letter-spacing: -0.5px;
          margin: 0 0 4px 0;
        }

        .eas-profile-org {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-primary);
          margin-bottom: 24px;
        }

        .eas-profile-details {
          width: 100%;
          border-top: 1px solid var(--border-color);
          padding-top: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          text-align: left;
          margin-bottom: 28px;
        }

        .eas-profile-field-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .eas-profile-field-val {
          font-size: 14px;
          color: var(--text-main);
          font-weight: 600;
          margin-top: 2px;
          word-break: break-all;
        }

        /* Qr View dialog overlay */
        .eas-qr-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: grid;
          place-items: center;
          z-index: 1000;
          padding: 20px;
          animation: eas-fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-qr-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 28px;
          max-width: 380px;
          width: 100%;
          box-shadow: var(--shadow-lg);
          text-align: center;
          animation: eas-card-appear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-qr-image-wrapper {
          background: white;
          padding: 16px;
          border-radius: 12px;
          display: inline-block;
          margin: 16px 0;
          border: 1px solid var(--border-color);
        }
      ` }} />

      <div className="eas-me-grid">
        {/* PROFILE SIDEBAR */}
        <aside className="eas-profile-sidebar">
          <div className="eas-profile-avatar">
            {profile.fullName.charAt(0).toUpperCase()}
          </div>
          <h2 className="eas-profile-name">{profile.fullName}</h2>
          <span className="eas-profile-org">{profile.organization.name}</span>

          <div className="eas-profile-details">
            <div>
              <div className="eas-profile-field-label">Identifier ID</div>
              <div className="eas-profile-field-val" style={{ fontFamily: 'var(--font-mono)' }}>{profile.identifier}</div>
            </div>
            <div>
              <div className="eas-profile-field-label">Email Address</div>
              <div className="eas-profile-field-val">{profile.email}</div>
            </div>
          </div>

          <button onClick={logout} className="eas-btn-secondary" style={{ width: '100%', justifyContent: 'center', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--color-danger-text)' }}>
            Sign Out Account
          </button>
        </aside>

        {/* RIGHT COLUMN CONTENT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* ASSIGNED EVENTS */}
          <section className="eas-attendee-panel" style={{ padding: '24px' }}>
            <h3 className="eas-panel-title" style={{ fontSize: '18px' }}>My Assigned Events</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '-8px', marginBottom: '8px' }}>
              Events you are registered to attend. Click to check in or generate scan badges.
            </p>

            {events === null && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading assigned events...</div>}
            {events !== null && events.length === 0 && (
              <div className="eas-empty-state" style={{ padding: '24px' }}>
                You have no assigned events in this organization.
              </div>
            )}

            {events && events.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {events.map((e) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px 20px', gap: '16px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>{e.name}</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          📅 {new Date(e.startsAt).toLocaleDateString()} {new Date(e.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {e.location && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            📍 {e.location}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`eas-badge ${e.status.toLowerCase()}`}>
                        {e.status}
                      </span>
                      <button
                        onClick={() => fetchQr(e.id, e.name, 'svg')}
                        disabled={qrLoading !== null}
                        className="eas-btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        {qrLoading === e.id ? 'Generating...' : 'View QR Badge'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ATTENDANCE RECORDS HISTORY */}
          <section className="eas-attendee-panel" style={{ padding: '24px' }}>
            <h3 className="eas-panel-title" style={{ fontSize: '18px' }}>My Attendance History</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '-8px', marginBottom: '8px' }}>
              Your check-in log records across past event sessions.
            </p>

            {attendance === null && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading history...</div>}
            {attendance !== null && attendance.length === 0 && (
              <div className="eas-empty-state" style={{ padding: '24px' }}>
                No check-in entries logged yet.
              </div>
            )}

            {attendance && attendance.length > 0 && (
              <div className="eas-table-container">
                <table className="eas-data-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Scanned At</th>
                      <th>Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((r) => (
                      <tr key={r.recordId}>
                        <td style={{ fontWeight: 600 }}>{r.event.name}</td>
                        <td style={{ fontSize: '13px' }}>
                          {new Date(r.scannedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                            {r.source.toLowerCase()}
                          </span>
                        </td>
                        <td>
                          {r.outsideGeofence ? (
                            <span className="eas-badge danger" title={r.distanceM ? `Scanned ${Math.round(r.distanceM)}m away` : 'Flagged scan'}>
                              Flagged
                            </span>
                          ) : (
                            <span className="eas-badge success">
                              Verified
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* QR MODAL VIEWER */}
      {qrModal && (
        <div className="eas-qr-overlay" onClick={() => setQrModal(null)}>
          <div className="eas-qr-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>{qrModal.eventName}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>Show this badge to the scanner device at check-in.</p>
            
            <div className="eas-qr-image-wrapper">
              <img
                src={`data:${qrModal.payload.imageMime};base64,${qrModal.payload.image}`}
                alt="My check-in QR Code"
                style={{ display: 'block', maxWidth: '180px', height: 'auto', margin: '0 auto' }}
              />
            </div>

            <div style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
              {qrModal.payload.url}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={downloadQr} className="eas-btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                Download QR
              </button>
              <button onClick={() => setQrModal(null)} className="eas-btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
