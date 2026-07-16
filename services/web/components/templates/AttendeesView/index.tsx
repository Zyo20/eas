'use client';

import React from 'react';
import DashboardLayout from '../DashboardLayout';
import { useHooks } from './hooks';
import {
  type BulkCreateAccountsResponse,
  type BulkDeleteResponse,
  type CleanupOrphanResult,
  type SetupLinkEntry,
  type BulkSkippedEntry,
} from '@/lib/api';

export type { SingleAccountResult, ModalState, AttendeesViewProps } from './types';
import type { AttendeesViewProps } from './types';

export default function AttendeesView(props: AttendeesViewProps) {
  const {
    orgId,
    list,
    rawList,
    form,
    setForm,
    err,
    filter,
    setFilter,
    busy,
    selected,
    modal,
    setModal,
    bulkBusy,
    bulkText,
    setBulkText,
    deleteBusy,
    cleanupBusy,
    copyFeedback,
    onBulkSelect,
    onCreate,
    onImport,
    onCreateAccount,
    onBulkCreateAccounts,
    onCleanupAndRetry,
    onAskBulkDelete,
    confirmBulkDelete,
    toggleSelect,
    toggleSelectAll,
    copyToClipboard,
    downloadBulkCsv,
    downloadSampleExcel,
  } = useHooks(props);

  const closeModal = () => setModal({ kind: 'none' });

  if (rawList === null) {
    return (
      <DashboardLayout title="Attendees Roster">
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '48px 0' }}>
          Loading roster list...
        </div>
      </DashboardLayout>
    );
  }

  const allVisibleSelected = list.length > 0 && list.every((a) => selected.has(a.id));
  const someSelected = selected.size > 0;

  return (
    <DashboardLayout title="Attendees Roster">
      <style dangerouslySetInnerHTML={{ __html: `
        .eas-attendee-controls-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
          animation: eas-card-appear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @media (max-width: 800px) {
          .eas-attendee-controls-grid {
            grid-template-columns: 1fr;
          }
        }

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

        .eas-attendee-panel {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 24px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Modal styling overlay */
        .eas-modal-overlay {
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

        .eas-modal-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 32px;
          max-width: 580px;
          width: 100%;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: var(--shadow-lg), 0 0 100px rgba(99, 102, 241, 0.1);
          animation: eas-card-appear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .eas-modal-title {
          font-family: 'Outfit', sans-serif;
          font-size: 20px;
          font-weight: 800;
          color: var(--text-main);
          letter-spacing: -0.5px;
          margin: 0;
        }

        .eas-modal-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          margin-top: -12px;
          line-height: 1.5;
        }

        .eas-modal-code-box {
          background: var(--bg-main);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 14px;
          font-family: var(--font-mono);
          font-size: 12px;
          word-break: break-all;
          color: var(--text-main);
        }

        .eas-bulk-import-banner {
          background: var(--bg-card-hover);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
          font-size: 13px;
          color: var(--text-main);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 24px;
          animation: eas-card-appear 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-import-input-label {
          padding: 6px 12px;
          background: var(--color-primary);
          color: white;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .eas-import-input-label:hover {
          background: var(--color-primary-hover);
        }

        /* Toolbar */
        .eas-roster-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .eas-roster-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 24px;
          box-shadow: var(--shadow-sm);
          animation: eas-card-appear 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-roster-actions-active {
          display: flex;
          align-items: center;
          gap: 8px;
          animation: eas-fade-in 0.2s ease-in-out;
        }
      ` }} />

      {/* Roster actions Modals */}
      {modal.kind !== 'none' && (
        <div className="eas-modal-overlay" onClick={closeModal}>
          <div className="eas-modal-card" onClick={(e) => e.stopPropagation()}>
            {modal.kind === 'single' && (
              <>
                <h3 className="eas-modal-title">Account Activation Created</h3>
                <p className="eas-modal-subtitle">
                  Provide this one-time link to <strong>{modal.result.email}</strong> to set up their password. Expire in 7 days.
                </p>
                <div className="eas-modal-code-box">{modal.result.setupUrl}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    id="copy-setup-url"
                    onClick={() => copyToClipboard(modal.result.setupUrl, 'Link copied!')}
                    className="eas-btn-primary"
                  >
                    {copyFeedback ?? '📋 Copy Link'}
                  </button>
                  <button onClick={closeModal} className="eas-btn-secondary">
                    Close
                  </button>
                </div>
              </>
            )}

            {modal.kind === 'bulk' && (
              <>
                <h3 className="eas-modal-title">{modal.result.summary.created} Accounts Activated</h3>
                <p className="eas-modal-subtitle">
                  {modal.result.summary.created} accounts successfully generated, {modal.result.summary.skipped} skipped out of {modal.result.summary.requested} requested.
                </p>

                {modal.result.summary.emailFailures > 0 && (
                  <div style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: '10px', padding: '12px', fontSize: '13px', color: 'var(--color-warning-text)' }}>
                    ⚠ <strong>SMTP limits reached.</strong> The attendee accounts were created, but the invitation email could not be delivered. Copy setup links manually below. Error: <code>{modal.result.created.find((c: SetupLinkEntry) => !c.emailSent)?.emailError}</code>
                  </div>
                )}

                {modal.cleanup && (
                  <div style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: '10px', padding: '12px', fontSize: '13px', color: 'var(--color-success-text)' }}>
                    ✓ <strong>Cleanup run success:</strong> Freed {modal.cleanup.summary.cleaned} orphaned email records. Retried the activation immediately.
                  </div>
                )}

                {modal.result.created.length > 0 && (
                  <div className="eas-modal-code-box" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {modal.result.created.map((e: SetupLinkEntry) => (
                      <div key={e.attendeeId} style={{ marginBottom: '8px', borderLeft: e.emailSent ? 'none' : '3px solid var(--color-warning)', paddingLeft: '6px' }}>
                        <strong>{e.email} {!e.emailSent && <span style={{ color: 'var(--color-warning-text)', fontSize: '10px' }}>[Email Failed]</span>}</strong>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', wordBreak: 'break-all' }}>{e.setupUrl}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {modal.result.summary.created === 0 && !modal.cleanup && modal.result.skipped.length > 0 && modal.result.skipped.every((s: BulkSkippedEntry) => s.reason === 'email_taken') && (
                    <button
                      id="cleanup-and-retry-btn"
                      onClick={onCleanupAndRetry}
                      disabled={cleanupBusy}
                      className="eas-btn-primary"
                    >
                      {cleanupBusy ? 'Processing...' : 'Free Stale Emails & Retry'}
                    </button>
                  )}
                  <button id="bulk-download-csv" onClick={() => downloadBulkCsv(modal.result)} className="eas-btn-primary">
                    Download links CSV
                  </button>
                  <button
                    id="bulk-copy-all"
                    onClick={() => {
                      const text = modal.result.created.map((e: SetupLinkEntry) => `${e.email}: ${e.setupUrl}`).join('\n');
                      copyToClipboard(text, 'All links copied!');
                    }}
                    className="eas-btn-secondary"
                  >
                    {copyFeedback ?? '📋 Copy All'}
                  </button>
                  <button onClick={closeModal} className="eas-btn-secondary">
                    Close
                  </button>
                </div>
              </>
            )}

            {modal.kind === 'bulk-delete-confirm' && (
              <>
                <h3 className="eas-modal-title" style={{ color: 'var(--color-danger-text)' }}>Confirm Deletion of {modal.ids.length} Attendees?</h3>
                <p className="eas-modal-subtitle">
                  Attendees will be soft-deleted. Attendance logs and event rosters will be preserved in DB for auditing.
                </p>

                <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: '10px', padding: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                  {list?.filter(a => modal.ids.includes(a.id)).map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--color-danger-text)', padding: '2px 0' }}>
                      <span>{a.fullName}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', opacity: 0.8 }}>{a.identifier}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={closeModal} className="eas-btn-secondary" disabled={deleteBusy}>
                    Cancel
                  </button>
                  <button
                    id="bulk-delete-confirm-btn"
                    onClick={confirmBulkDelete}
                    disabled={deleteBusy}
                    className="eas-btn-primary"
                    style={{ background: 'var(--color-danger)', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)' }}
                  >
                    {deleteBusy ? 'Deleting...' : `Confirm Delete (${modal.ids.length})`}
                  </button>
                </div>
              </>
            )}

            {modal.kind === 'bulk-delete-result' && (
              <>
                <h3 className="eas-modal-title" style={{ color: 'var(--color-danger-text)' }}>{modal.result.summary.deleted} Attendees Tombstoned</h3>
                <p className="eas-modal-subtitle">
                  {modal.result.summary.deleted} attendees deleted, {modal.result.summary.skipped} skipped.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={closeModal} className="eas-btn-primary">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TOP CONTROLS */}
      <section className="eas-attendee-controls-grid">
        {/* Create Single attendee form */}
        <div className="eas-attendee-panel">
          <h2 className="eas-panel-title">Add Single Attendee</h2>
          <form onSubmit={onCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} id="eas-add-attendee-form">
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px' }}>
              <label className="eas-login-label">
                Identifier ID
                <input
                  type="text"
                  value={form.identifier}
                  onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                  required
                  placeholder="e.g. ATT-081"
                  className="eas-input"
                  id="eas-attendee-id"
                  disabled={busy}
                />
              </label>

              <label className="eas-login-label">
                Full Name
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                  placeholder="e.g. Samuel Green"
                  className="eas-input"
                  id="eas-attendee-fullname"
                  disabled={busy}
                />
              </label>
            </div>

            <label className="eas-login-label">
              Email Address
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                placeholder="e.g. sam@lincolnland.edu"
                className="eas-input"
                id="eas-attendee-email"
                disabled={busy}
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="eas-btn-primary"
              id="eas-attendee-submit"
              style={{ width: '100%', justifyContent: 'center', minHeight: '44px', marginTop: '6px' }}
            >
              {busy ? <span>Adding...</span> : <span>+ Add Attendee</span>}
            </button>
          </form>
        </div>

        {/* Search controls */}
        <div className="eas-attendee-panel">
          <h2 className="eas-panel-title">Bulk Selection Search</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="eas-login-label">
              Filter Active Roster
              <div className="eas-search-wrapper">
                <svg className="eas-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder={`Search ${list.length} attendees...`}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="eas-input eas-search-input"
                />
              </div>
            </label>

            <label className="eas-login-label">
              Bulk Identifier Select (Comma/Space separated IDs)
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. ATT-001 ATT-002"
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="eas-input"
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={onBulkSelect} className="eas-btn-secondary" style={{ minHeight: '45px' }}>
                  Select
                </button>
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* Bulk Excel import Banner */}
      <section className="eas-bulk-import-banner">
        <div>
          🚀 <strong>Bulk Spreadsheet Import:</strong> Upload an Excel/CSV file with columns: <code>identifier, fullName, email</code>.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={downloadSampleExcel} className="eas-btn-secondary" style={{ border: 'none', background: 'transparent', textDecoration: 'underline' }}>
            Download Sample Excel
          </button>
          <label className="eas-import-input-label">
            Choose Spreadsheet File
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onImport} style={{ display: 'none' }} />
          </label>
        </div>
      </section>

      {/* Main Roster Panel */}
      <div className="eas-roster-card">
        <header className="eas-roster-toolbar">
          <h2 className="eas-table-title">Registered Roster</h2>

          {someSelected && (
            <div className="eas-roster-actions-active">
              <button
                id="bulk-create-accounts-btn"
                onClick={onBulkCreateAccounts}
                disabled={bulkBusy}
                className="eas-btn-primary"
                style={{ padding: '8px 14px', fontSize: '12px' }}
              >
                {bulkBusy ? 'Creating...' : `Activate Accounts (${selected.size})`}
              </button>
              <button
                id="bulk-delete-btn"
                onClick={onAskBulkDelete}
                disabled={deleteBusy}
                className="eas-btn-secondary"
                style={{ padding: '8px 14px', fontSize: '12px', borderColor: 'rgba(239, 68, 68, 0.4)', background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}
              >
                Delete ({selected.size})
              </button>
            </div>
          )}
        </header>

        {err && <div style={{ color: 'var(--color-danger-text)', fontSize: '13px', marginBottom: '12px' }}>{err}</div>}

        {list.length === 0 ? (
          <div className="eas-empty-state">
            No attendees match filters. Use forms to add or import.
          </div>
        ) : (
          <div className="eas-table-container">
            <table className="eas-data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      id="select-all-checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      title={allVisibleSelected ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                  <th>Identifier</th>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td style={{ textAlign: 'center', width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                      />
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>{a.identifier}</td>
                    <td>{a.fullName}</td>
                    <td>{a.email ?? '—'}</td>
                    <td>
                      <span className={`eas-badge ${a.hasAccount ? 'success' : 'danger'}`} style={{ textTransform: 'none' }}>
                        {a.hasAccount ? 'Active Account' : 'No Account'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!a.hasAccount && (
                        <button
                          onClick={() => onCreateAccount(a)}
                          disabled={busy}
                          className="eas-btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                        >
                          Create Account
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
