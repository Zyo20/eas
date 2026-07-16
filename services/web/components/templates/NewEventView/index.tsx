'use client';

import React from 'react';
import Link from 'next/link';
import DashboardLayout from '../DashboardLayout';
import MapPicker from '@/components/MapPicker';
import { useHooks } from './hooks';

import type { NewEventViewProps } from './types';
export type { NewEventViewProps } from './types';

export default function NewEventView(props: NewEventViewProps) {
  const {
    form,
    setForm,
    picked,
    filteredAttendees,
    attendees,
    filter,
    setFilter,
    bulkText,
    setBulkText,
    busy,
    err,
    onBulkSelect,
    toggle,
    selectAll,
    clearAll,
    onSubmit,
  } = useHooks(props);

  return (
    <DashboardLayout title="Create New Event">
      <style dangerouslySetInnerHTML={{ __html: `
        .eas-new-event-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-top: 16px;
          animation: eas-card-appear 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @media (max-width: 900px) {
          .eas-new-event-grid {
            grid-template-columns: 1fr;
          }
        }

        .eas-new-event-panel {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 24px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .eas-panel-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          margin-top: -12px;
          margin-bottom: 8px;
        }

        .eas-roster-list-wrapper {
          border: 1px solid var(--border-color);
          background: var(--bg-main);
          border-radius: 10px;
          max-height: 240px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .eas-roster-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
          font-size: 13px;
          color: var(--text-main);
          transition: background-color 0.2s;
        }

        .eas-roster-item:hover {
          background: var(--bg-card-hover);
        }

        .eas-roster-item:last-child {
          border-bottom: none;
        }

        .eas-roster-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .eas-geo-row {
          display: grid;
          grid-template-columns: 1fr 1fr 100px;
          gap: 10px;
        }

        .eas-roster-header-row {
          display: flex;
          gap: 10px;
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

      <form onSubmit={onSubmit} className="eas-new-event-grid" id="eas-create-event-form">
        {/* LEFT COLUMN: Basic Event details */}
        <div className="eas-new-event-panel">
          <h2 className="eas-panel-title">Basic Information</h2>
          <p className="eas-panel-subtitle">Provide key details for your new event roster.</p>

          <label className="eas-login-label">
            Event Title / Name
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. Fall Semester Graduation Ceremony"
              className="eas-input"
              id="eas-event-name"
              disabled={busy}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px', gap: '12px' }}>
            <label className="eas-login-label">
              Starts At
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                required
                className="eas-input"
                id="eas-event-starts-at"
                disabled={busy}
              />
            </label>

            <label className="eas-login-label">
              Ends At
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                required
                className="eas-input"
                id="eas-event-ends-at"
                disabled={busy}
              />
            </label>

            <label className="eas-login-label">
              Initial Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                className="eas-input"
                id="eas-event-status"
                style={{ height: '45px' }}
                disabled={busy}
              >
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </label>
          </div>

          <label className="eas-login-label">
            Location Name
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Lincoln Land CC Sports Hall"
              className="eas-input"
              id="eas-event-location"
              disabled={busy}
            />
          </label>

          <label className="eas-login-label">
            Event Description
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Provide a description/guidelines for checking staff..."
              className="eas-input"
              style={{ minHeight: '100px', resize: 'vertical' }}
              id="eas-event-description"
              disabled={busy}
            />
          </label>
        </div>

        {/* RIGHT COLUMN: Roster Selection & Geofencing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Geofence Configuration */}
          <div className="eas-new-event-panel">
            <h2 className="eas-panel-title">Geofence Controls (Optional)</h2>
            <p className="eas-panel-subtitle">Define checking coordinates. Leave blank to disable location verification.</p>

            <div className="eas-geo-row">
              <label className="eas-login-label">
                Latitude
                <input
                  type="number"
                  step="0.0000000001"
                  min={-90}
                  max={90}
                  placeholder="Latitude"
                  value={form.locationLat}
                  onChange={(e) => setForm({ ...form, locationLat: e.target.value })}
                  className="eas-input"
                  id="eas-event-lat"
                  disabled={busy}
                />
              </label>

              <label className="eas-login-label">
                Longitude
                <input
                  type="number"
                  step="0.0000000001"
                  min={-180}
                  max={180}
                  placeholder="Longitude"
                  value={form.locationLng}
                  onChange={(e) => setForm({ ...form, locationLng: e.target.value })}
                  className="eas-input"
                  id="eas-event-lng"
                  disabled={busy}
                />
              </label>

              <label className="eas-login-label">
                Radius (m)
                <input
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  placeholder="50"
                  value={form.geofenceRadiusM}
                  onChange={(e) => setForm({ ...form, geofenceRadiusM: e.target.value })}
                  className="eas-input"
                  id="eas-event-radius"
                  disabled={busy}
                />
              </label>
            </div>

            <MapPicker
              lat={form.locationLat.trim() === '' ? null : Number(form.locationLat)}
              lng={form.locationLng.trim() === '' ? null : Number(form.locationLng)}
              radius={Number(form.geofenceRadiusM) || 50}
              onChange={(latVal, lngVal) => setForm((prev) => ({
                ...prev,
                locationLat: latVal.toString(),
                locationLng: lngVal.toString(),
              }))}
            />

            <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: 0 }}>
              💡 GPS coordinates chosen on the map automatically fill coordinates inputs. Scans outside radius get flagged.
            </p>
          </div>

          {/* Roster Pickers */}
          <div className="eas-new-event-panel">
            <h2 className="eas-panel-title">Attendees Roster ({picked.size} selected of {attendees.length})</h2>
            <p className="eas-panel-subtitle">Select attendees mapping access to this event session.</p>

            <div className="eas-roster-header-row">
              <input
                type="text"
                placeholder="Filter by name/ID..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="eas-input"
                style={{ flex: 1 }}
                disabled={busy}
              />
              <input
                type="text"
                placeholder="Bulk ID search (spaces)..."
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className="eas-input"
                style={{ flex: 2 }}
                disabled={busy}
              />
              <button
                type="button"
                onClick={onBulkSelect}
                className="eas-btn-secondary"
                style={{ minHeight: '44px' }}
                disabled={busy}
              >
                Select
              </button>
            </div>

            <div className="eas-roster-list-wrapper">
              {filteredAttendees.map((a) => (
                <label key={a.id} className="eas-roster-item">
                  <input
                    type="checkbox"
                    checked={picked.has(a.id)}
                    onChange={() => toggle(a.id)}
                    disabled={busy}
                  />
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px', minWidth: '70px' }}>
                    {a.identifier}
                  </span>
                  <span style={{ fontWeight: 600 }}>{a.fullName}</span>
                </label>
              ))}

              {filteredAttendees.length === 0 && (
                <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
                  No attendees matching search tags.
                </div>
              )}
            </div>

            <div className="eas-roster-actions">
              <button type="button" onClick={selectAll} className="eas-btn-secondary" style={{ fontSize: '11px', padding: '6px 12px' }} disabled={busy}>
                Select All Filtered
              </button>
              <button type="button" onClick={clearAll} className="eas-btn-secondary" style={{ fontSize: '11px', padding: '6px 12px' }} disabled={busy}>
                Clear Selections
              </button>
            </div>

            {err && <div style={{ color: 'var(--color-danger-text)', fontSize: '13px', marginTop: '4px' }}>{err}</div>}

            <button
              type="submit"
              disabled={busy || picked.size === 0}
              className="eas-btn-primary"
              id="eas-create-event-submit-btn"
              style={{ width: '100%', justifyContent: 'center', minHeight: '48px', marginTop: '8px' }}
            >
              {busy ? (
                <span>Creating Event...</span>
              ) : (
                <span>Create Event ({picked.size} Attendees)</span>
              )}
            </button>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
}
