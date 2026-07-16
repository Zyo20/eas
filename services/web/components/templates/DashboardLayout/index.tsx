'use client';

import React from 'react';
import Link from 'next/link';
import { useHooks } from './hooks';

export interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
}

export default function DashboardLayout(props: DashboardLayoutProps) {
  const {
    user,
    loading,
    theme,
    toggleTheme,
    handleLogout,
    pathname,
  } = useHooks(props);

  if (loading) {
    return (
      <div className="eas-layout-loading-screen">
        <style dangerouslySetInnerHTML={{ __html: `
          .eas-layout-loading-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-main);
            color: var(--text-muted);
            font-family: 'Inter', sans-serif;
          }
          .eas-layout-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--border-color);
            border-top-color: var(--color-primary);
            border-radius: 50%;
            animation: eas-spin 0.8s infinite linear;
          }
          @keyframes eas-spin {
            to { transform: rotate(360deg); }
          }
        ` }} />
        <div className="eas-layout-spinner" />
      </div>
    );
  }

  return (
    <div className="eas-dashboard-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        /* Background Glows */
        .eas-layout-glow-1 {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0) 70%);
          top: -150px;
          left: -100px;
          animation: eas-glow-move 20s infinite alternate ease-in-out;
          pointer-events: none;
          z-index: 1;
        }

        .eas-layout-glow-2 {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.06) 0%, rgba(168, 85, 247, 0) 70%);
          bottom: -200px;
          right: -100px;
          animation: eas-glow-move 25s infinite alternate ease-in-out;
          pointer-events: none;
          z-index: 1;
        }

        .eas-sidebar-logo {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-family: 'Outfit', sans-serif;
          font-size: 20px;
          margin-bottom: 40px;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
        }

        .eas-sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          align-items: center;
        }

        .eas-sidebar-link {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }

        .eas-sidebar-link:hover {
          color: var(--text-main);
          background: var(--bg-card-hover);
        }

        .eas-sidebar-link.active {
          color: var(--color-primary);
          background: var(--color-primary-glow);
        }

        .eas-sidebar-link.active::before {
          content: '';
          position: absolute;
          left: -16px;
          width: 4px;
          height: 24px;
          background: var(--color-primary);
          border-radius: 0 4px 4px 0;
          box-shadow: 0 0 8px var(--color-primary);
        }

        .eas-sidebar-footer {
          margin-top: auto;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .eas-header-panel {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 32px;
          background: var(--header-bg);
          backdrop-filter: var(--backdrop-blur);
          -webkit-backdrop-filter: var(--backdrop-blur);
          border-bottom: 1px solid var(--header-border);
          position: sticky;
          top: 0;
          z-index: 90;
          transition: background-color 0.3s ease, border-color 0.3s ease;
          width: 100%;
        }

        .eas-header-title {
          font-family: 'Outfit', sans-serif;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text-main);
        }

        .eas-header-actions {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .eas-theme-btn {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .eas-theme-btn:hover {
          color: var(--text-main);
          border-color: var(--border-color-hover);
          background: var(--bg-card-hover);
        }

        .eas-profile-widget {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 6px 12px;
          border-radius: 12px;
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          cursor: pointer;
          position: relative;
          transition: all 0.2s ease;
        }

        .eas-profile-widget:hover {
          border-color: var(--border-color-hover);
          background: var(--bg-card-hover);
        }

        .eas-profile-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1e1b4b;
          font-family: 'Outfit', sans-serif;
          font-weight: 700;
          font-size: 13px;
        }

        .eas-profile-details {
          display: flex;
          flex-direction: column;
          text-align: left;
        }

        .eas-profile-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main);
        }

        .eas-profile-email {
          font-size: 11px;
          color: var(--text-muted);
        }

        .eas-main-layout-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 10;
          margin-left: 80px;
        }
      ` }} />

      <div className="eas-layout-glow-1" aria-hidden="true" />
      <div className="eas-layout-glow-2" aria-hidden="true" />

      {/* FIXED SIDEBAR */}
      <aside className="eas-sidebar">
        <div className="eas-sidebar-logo">E</div>

        <nav className="eas-sidebar-nav">
          <Link
            href="/dashboard"
            className={`eas-sidebar-link ${pathname === '/dashboard' || pathname.startsWith('/events') ? 'active' : ''}`}
            title="Events Dashboard"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
          </Link>

          <Link
            href="/attendees"
            className={`eas-sidebar-link ${pathname === '/attendees' ? 'active' : ''}`}
            title="Attendees Roster"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </Link>
        </nav>

        <div className="eas-sidebar-footer">
          <button onClick={handleLogout} className="eas-sidebar-link" title="Sign Out" style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* CONTENT REGION */}
      <div className="eas-main-layout-container">
        {/* HEADER PANEL */}
        <header className="eas-header-panel">
          <div className="eas-header-title">{props.title}</div>
          <div className="eas-header-actions">
            {/* Theme Toggle Button */}
            <button onClick={toggleTheme} className="eas-theme-btn" title="Toggle Light/Dark Theme">
              {theme === 'dark' ? (
                // Sun Icon
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                // Moon Icon
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Profile widget */}
            {user && (
              <div className="eas-profile-widget" onClick={handleLogout} title="Click to Sign Out">
                <div className="eas-profile-avatar">
                  {user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'A'}
                </div>
                <div className="eas-profile-details">
                  <span className="eas-profile-name">{user.name}</span>
                  <span className="eas-profile-email">{user.email}</span>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* PAGE VIEWS children */}
        <main className="eas-main-content">
          {props.children}
        </main>
      </div>
    </div>
  );
}
