'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '../DashboardLayout';
import { useHooks } from './hooks';

import type { DashboardViewProps } from './types';
export type { DashboardViewProps } from './types';

export default function DashboardView(props: DashboardViewProps) {
  const {
    events,
    rawEvents,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    metrics,
    getScannerUrl,
  } = useHooks(props);

  // Live ticking clock state
  const [time, setTime] = useState<string>('00:00:00 AM');
  const [date, setDate] = useState<string>('Loading Date...');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDate(now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <DashboardLayout title="Events Manager">
      <style dangerouslySetInnerHTML={{ __html: `
        .eas-dash-grid {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
          animation: eas-card-appear 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Left Time card widget */
        .eas-time-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          box-shadow: var(--shadow-sm);
          min-height: 200px;
        }

        .eas-time-card-top {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }

        .eas-time-indicator {
          font-family: 'Outfit', sans-serif;
          font-size: 28px;
          font-weight: 800;
          color: var(--text-main);
          letter-spacing: -0.5px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .eas-time-indicator svg {
          color: #f59e0b;
        }

        .eas-date-indicator {
          font-size: 13px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .eas-time-insight {
          font-size: 11px;
          color: var(--color-primary);
          font-family: var(--font-mono);
          margin-top: 4px;
        }

        /* Right metrics grid */
        .eas-metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .eas-metric-box {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: var(--shadow-sm);
          transition: transform 0.2s, border-color 0.2s;
        }

        .eas-metric-box:hover {
          transform: translateY(-2px);
          border-color: var(--border-color-hover);
        }

        .eas-metric-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .eas-metric-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .eas-metric-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .eas-metric-value {
          font-family: 'Outfit', sans-serif;
          font-size: 26px;
          font-weight: 800;
          color: var(--text-main);
        }

        .eas-metric-subtitle {
          font-size: 11px;
          color: var(--text-muted);
        }

        /* Main Data Table Card */
        .eas-table-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 24px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: eas-card-appear 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .eas-table-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }

        .eas-table-title {
          font-family: 'Outfit', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: var(--text-main);
        }

        .eas-table-controls {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .eas-search-wrapper {
          position: relative;
          min-width: 240px;
        }

        .eas-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .eas-search-input {
          padding-left: 36px;
        }

        .eas-filter-tabs {
          display: flex;
          background: var(--bg-main);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 3px;
          gap: 2px;
        }

        .eas-filter-tab {
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .eas-filter-tab:hover {
          color: var(--text-main);
        }

        .eas-filter-tab.active {
          background: var(--bg-card);
          color: var(--text-main);
          box-shadow: var(--shadow-sm);
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

        .eas-event-link {
          color: var(--color-primary);
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s;
        }

        .eas-event-link:hover {
          color: var(--color-primary-hover);
          text-decoration: underline;
        }

        .eas-action-link {
          color: var(--color-primary);
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: opacity 0.2s;
        }

        .eas-action-link:hover {
          opacity: 0.8;
          text-decoration: underline;
        }

        .eas-empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--text-muted);
          font-size: 14px;
        }
      ` }} />

      <div className="eas-dash-grid">
        {/* Real-time Clock Card */}
        <section className="eas-time-card">
          <div className="eas-time-card-top">
            <div className="eas-time-indicator">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <span>{time}</span>
            </div>
            <div className="eas-date-indicator">{date}</div>
            <div className="eas-time-insight">● LIVE REAL-TIME FEED</div>
          </div>

          <Link href="/events/new" className="eas-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 24 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create Event</span>
          </Link>
        </section>

        {/* 4 Statistics Metrics Cards */}
        <section className="eas-metrics-grid">
          <div className="eas-metric-box">
            <div className="eas-metric-header">
              <span className="eas-metric-title">Total Events</span>
              <div className="eas-metric-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
            </div>
            <span className="eas-metric-value">{metrics.total}</span>
            <span className="eas-metric-subtitle">Registered events in database</span>
          </div>

          <div className="eas-metric-box">
            <div className="eas-metric-header">
              <span className="eas-metric-title">Open Events</span>
              <div className="eas-metric-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
            <span className="eas-metric-value">{metrics.open}</span>
            <span className="eas-metric-subtitle">Currently active/accepting scans</span>
          </div>

          <div className="eas-metric-box">
            <div className="eas-metric-header">
              <span className="eas-metric-title">Draft Events</span>
              <div className="eas-metric-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
            </div>
            <span className="eas-metric-value">{metrics.draft}</span>
            <span className="eas-metric-subtitle">Awaiting publication status</span>
          </div>

          <div className="eas-metric-box">
            <div className="eas-metric-header">
              <span className="eas-metric-title">Closed Events</span>
              <div className="eas-metric-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </div>
            <span className="eas-metric-value">{metrics.closed}</span>
            <span className="eas-metric-subtitle">Archived events historical log</span>
          </div>
        </section>
      </div>

      {/* Events Table Container */}
      <div className="eas-table-card">
        <header className="eas-table-header">
          <h2 className="eas-table-title">Events Overview</h2>
          
          <div className="eas-table-controls">
            {/* Search inputs */}
            <div className="eas-search-wrapper">
              <svg className="eas-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search event name or location..."
                className="eas-input eas-search-input"
              />
            </div>

            {/* Filter Tabs */}
            <div className="eas-filter-tabs">
              <button onClick={() => setStatusFilter('ALL')} className={`eas-filter-tab ${statusFilter === 'ALL' ? 'active' : ''}`}>All</button>
              <button onClick={() => setStatusFilter('OPEN')} className={`eas-filter-tab ${statusFilter === 'OPEN' ? 'active' : ''}`}>Open</button>
              <button onClick={() => setStatusFilter('DRAFT')} className={`eas-filter-tab ${statusFilter === 'DRAFT' ? 'active' : ''}`}>Drafts</button>
              <button onClick={() => setStatusFilter('CLOSED')} className={`eas-filter-tab ${statusFilter === 'CLOSED' ? 'active' : ''}`}>Closed</button>
            </div>
          </div>
        </header>

        {error && <div style={{ color: 'var(--color-danger)', fontSize: 14 }}>{error}</div>}

        {loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>Loading Events List...</div>
        ) : events.length === 0 ? (
          <div className="eas-empty-state">
            {rawEvents && rawEvents.length === 0 ? 'No events yet — create one to get started.' : 'No events match your current filter guidelines.'}
          </div>
        ) : (
          <div className="eas-table-container">
            <table className="eas-data-table">
              <thead>
                <tr>
                  <th>Event Name</th>
                  <th>Status</th>
                  <th>Starts At</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <Link href={`/events/${ev.id}`} className="eas-event-link">
                        {ev.name}
                      </Link>
                    </td>
                    <td>
                      <span className={`eas-badge ${ev.status === 'OPEN' ? 'success' : ev.status === 'DRAFT' ? 'warning' : 'danger'}`}>
                        {ev.status}
                      </span>
                    </td>
                    <td>{new Date(ev.startsAt).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{ev.location ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <a
                        href={getScannerUrl(ev.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="eas-action-link"
                      >
                        <span>Open scanner</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </a>
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
