import { useHooks } from './hooks';
import Link from 'next/link';

export interface RegisterViewProps {}

export default function RegisterView(props: RegisterViewProps) {
  const {
    orgName,
    setOrgName,
    orgSlug,
    setOrgSlug,
    orgType,
    setOrgType,
    adminName,
    setAdminName,
    adminEmail,
    setAdminEmail,
    adminPassword,
    setAdminPassword,
    error,
    busy,
    success,
    onSubmit,
    isSlugValid,
    isPasswordValid,
  } = useHooks(props);

  if (success) {
    return (
      <main className="eas-reg-container" id="eas-register-page">
        <style dangerouslySetInnerHTML={{ __html: `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

          .eas-reg-container {
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

          .eas-reg-glow-1 {
            position: absolute;
            width: 500px;
            height: 500px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0) 70%);
            top: -100px;
            left: -100px;
            animation: eas-glow-move-1 25s infinite alternate ease-in-out;
            pointer-events: none;
          }

          .eas-reg-glow-2 {
            position: absolute;
            width: 600px;
            height: 600px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, rgba(168, 85, 247, 0) 70%);
            bottom: -150px;
            right: -100px;
            animation: eas-glow-move-2 30s infinite alternate ease-in-out;
            pointer-events: none;
          }

          @keyframes eas-glow-move-1 {
            0% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(100px, 80px) scale(1.1); }
            100% { transform: translate(-50px, 150px) scale(0.9); }
          }

          @keyframes eas-glow-move-2 {
            0% { transform: translate(0, 0) scale(1.1); }
            50% { transform: translate(-120px, -100px) scale(0.9); }
            100% { transform: translate(80px, 50px) scale(1); }
          }

          .eas-reg-card {
            width: 100%;
            max-width: 460px;
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

          @keyframes eas-card-appear {
            0% { opacity: 0; transform: translateY(20px); }
            100% { opacity: 1; transform: translateY(0); }
          }

          .eas-reg-success-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            text-align: center;
          }

          .eas-reg-success-circle {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: rgba(16, 185, 129, 0.1);
            border: 2px solid rgba(16, 185, 129, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            box-shadow: 0 0 24px rgba(16, 185, 129, 0.2);
            animation: eas-success-scale 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
          }

          @keyframes eas-success-scale {
            0% { transform: scale(0.6); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }

          .eas-reg-success-svg {
            width: 40px;
            height: 40px;
            color: #10b981;
          }

          .eas-reg-success-title {
            margin: 0;
            font-family: 'Outfit', sans-serif;
            font-size: 26px;
            font-weight: 800;
            color: #34d399;
            letter-spacing: -0.5px;
          }

          .eas-reg-success-text {
            margin: 0;
            font-size: 14px;
            color: #cbd5e1;
            line-height: 1.6;
          }

          .eas-reg-success-redirect {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            color: #64748b;
            margin-top: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .eas-reg-loader-success {
            width: 14px;
            height: 14px;
            border: 2px solid rgba(16, 185, 129, 0.2);
            border-top-color: #10b981;
            border-radius: 50%;
            animation: eas-spin 0.8s infinite linear;
          }

          @keyframes eas-spin {
            to { transform: rotate(360deg); }
          }
        ` }} />

        <div className="eas-reg-glow-1" />
        <div className="eas-reg-glow-2" />

        <div className="eas-reg-card" id="eas-register-success-card">
          <section className="eas-reg-success-container">
            <div className="eas-reg-success-circle">
              <svg
                className="eas-reg-success-svg"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="eas-reg-success-title">Registration Successful!</h2>
            <p className="eas-reg-success-text">
              Your organization and administrator account have been created successfully.
            </p>
            <div className="eas-reg-success-redirect">
              <span className="eas-reg-loader-success" />
              <span>Redirecting to login page...</span>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="eas-reg-container" id="eas-register-page">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        .eas-reg-container {
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

        .eas-reg-glow-1 {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0) 70%);
          top: -100px;
          left: -100px;
          animation: eas-glow-move-1 25s infinite alternate ease-in-out;
          pointer-events: none;
        }

        .eas-reg-glow-2 {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, rgba(168, 85, 247, 0) 70%);
          bottom: -150px;
          right: -100px;
          animation: eas-glow-move-2 30s infinite alternate ease-in-out;
          pointer-events: none;
        }

        @keyframes eas-glow-move-1 {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(100px, 80px) scale(1.1); }
          100% { transform: translate(-50px, 150px) scale(0.9); }
        }

        @keyframes eas-glow-move-2 {
          0% { transform: translate(0, 0) scale(1.1); }
          50% { transform: translate(-120px, -100px) scale(0.9); }
          100% { transform: translate(80px, 50px) scale(1); }
        }

        .eas-reg-card {
          width: 100%;
          max-width: 460px;
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

        @keyframes eas-card-appear {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        .eas-reg-header {
          text-align: center;
        }

        .eas-reg-title {
          margin: 0;
          font-family: 'Outfit', sans-serif;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: -0.75px;
          background: linear-gradient(135deg, #a5b4fc 0%, #d8b4fe 50%, #f472b6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .eas-reg-subtitle {
          margin: 10px 0 0 0;
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.5;
        }

        .eas-reg-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .eas-reg-section-title {
          font-size: 11px;
          font-weight: 700;
          color: #818cf8;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
          margin-top: 8px;
        }

        .eas-reg-section-title::after {
          content: '';
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, rgba(129, 140, 248, 0.3) 0%, rgba(129, 140, 248, 0) 100%);
        }

        .eas-reg-label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #cbd5e1;
        }

        .eas-reg-input {
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

        .eas-reg-input:hover {
          border-color: rgba(255, 255, 255, 0.22);
          background: rgba(5, 5, 15, 0.6);
        }

        .eas-reg-input:focus {
          border-color: #818cf8;
          box-shadow: 0 0 0 1px #818cf8, 0 0 16px rgba(129, 140, 248, 0.35);
          background: rgba(5, 5, 15, 0.75);
        }

        .eas-reg-input.error {
          border-color: #f87171 !important;
          box-shadow: 0 0 16px rgba(248, 113, 113, 0.25) !important;
        }

        .eas-reg-helper {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #64748b;
          margin-top: 4px;
          word-break: break-all;
        }

        .eas-reg-helper.error {
          color: #f87171;
        }

        .eas-reg-radio-group {
          display: flex;
          background: rgba(5, 5, 15, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 4px;
          gap: 4px;
        }

        .eas-reg-radio-btn {
          flex: 1;
          padding: 10px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: center;
        }

        .eas-reg-radio-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.03);
        }

        .eas-reg-radio-btn.active {
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .eas-reg-btn-submit {
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

        .eas-reg-btn-submit:hover:not(:disabled) {
          background-position: right center;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(168, 85, 247, 0.45);
        }

        .eas-reg-btn-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .eas-reg-btn-submit:disabled {
          background: #334155;
          color: #64748b;
          box-shadow: none;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .eas-reg-error-box {
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

        @keyframes eas-shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }

        .eas-reg-footer {
          text-align: center;
          margin-top: 8px;
        }

        .eas-reg-footer-text {
          margin: 0;
          font-size: 13px;
          color: #94a3b8;
        }

        .eas-reg-link {
          color: #a5b4fc;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s;
          position: relative;
        }

        .eas-reg-link:hover {
          color: #c084fc;
        }

        .eas-reg-link::after {
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

        .eas-reg-link:hover::after {
          transform: scaleX(1);
          transform-origin: bottom left;
        }

        .eas-reg-loader {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: eas-spin 0.8s infinite linear;
        }

        @keyframes eas-spin {
          to { transform: rotate(360deg); }
        }
      ` }} />

      <div className="eas-reg-glow-1" aria-hidden="true" />
      <div className="eas-reg-glow-2" aria-hidden="true" />

      <div className="eas-reg-card" id="eas-register-card">
        <header className="eas-reg-header">
          <h1 className="eas-reg-title">Create Tenant</h1>
          <p className="eas-reg-subtitle">Register a new organization and admin account</p>
        </header>

        <form onSubmit={onSubmit} className="eas-reg-form" id="eas-register-form">
          {error && (
            <div className="eas-reg-error-box" role="alert" id="eas-register-error">
              <span>{error}</span>
            </div>
          )}

          <div className="eas-reg-section-title">Organization Information</div>

          <label className="eas-reg-label">
            Organization Name
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Lapu-Lapu City College"
              required
              className="eas-reg-input"
              id="eas-reg-org-name"
              disabled={busy}
            />
          </label>

          <label className="eas-reg-label">
            Organization Slug
            <input
              type="text"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              placeholder="e.g. llcc"
              required
              className={`eas-reg-input ${!isSlugValid ? 'error' : ''}`}
              id="eas-reg-org-slug"
              disabled={busy}
            />
            <span className={`eas-reg-helper ${!isSlugValid ? 'error' : ''}`} id="eas-reg-slug-helper">
              URL: {orgSlug ? `${orgSlug.toLowerCase()}.eas.arrowtest.site` : 'slug.eas.arrowtest.site'} (lowercase, alphanumeric, hyphens)
            </span>
          </label>

          <div className="eas-reg-label">
            Organization Type
            <div className="eas-reg-radio-group">
              <button
                type="button"
                onClick={() => setOrgType('SCHOOL')}
                className={`eas-reg-radio-btn ${orgType === 'SCHOOL' ? 'active' : ''}`}
                id="eas-reg-type-school"
                disabled={busy}
              >
                School
              </button>
              <button
                type="button"
                onClick={() => setOrgType('ORG')}
                className={`eas-reg-radio-btn ${orgType === 'ORG' ? 'active' : ''}`}
                id="eas-reg-type-org"
                disabled={busy}
              >
                Other Org
              </button>
            </div>
          </div>

          <div className="eas-reg-section-title">Administrator Details</div>

          <label className="eas-reg-label">
            Full Name
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="e.g. Juan dela Cruz"
              required
              className="eas-reg-input"
              id="eas-reg-admin-name"
              disabled={busy}
            />
          </label>

          <label className="eas-reg-label">
            Email Address
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="e.g. admin@llcc.edu"
              required
              className="eas-reg-input"
              id="eas-reg-admin-email"
              disabled={busy}
            />
          </label>

          <label className="eas-reg-label">
            Password
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              className={`eas-reg-input ${!isPasswordValid ? 'error' : ''}`}
              id="eas-reg-admin-password"
              disabled={busy}
            />
            {!isPasswordValid && (
              <span className="eas-reg-helper error" id="eas-reg-password-helper">
                Password must be at least 8 characters long.
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={busy || !isSlugValid || !isPasswordValid || !orgName || !orgSlug || !adminName || !adminEmail || !adminPassword}
            className="eas-reg-btn-submit"
            id="eas-reg-submit"
          >
            {busy ? (
              <>
                <span className="eas-reg-loader" />
                <span>Registering Tenant...</span>
              </>
            ) : (
              'Register Organization'
            )}
          </button>
        </form>

        <footer className="eas-reg-footer">
          <p className="eas-reg-footer-text">
            Already have an organization?{' '}
            <Link href="/login" className="eas-reg-link" id="eas-reg-signin-link">
              Sign In
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
