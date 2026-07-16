import { useRegisterView } from './hooks';
import Link from 'next/link';

export default function RegisterView() {
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
  } = useRegisterView();

  if (success) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={successIconContainer}>
            <svg
              style={successSvg}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 style={successTitleStyle}>Registration Successful!</h2>
          <p style={successTextStyle}>
            Your organization and administrator account have been created successfully.
          </p>
          <p style={redirectTextStyle}>Redirecting you to the login page...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>Create Tenant</h1>
          <p style={subtitleStyle}>Register a new organization and admin account</p>
        </header>

        <form onSubmit={onSubmit} style={formStyle}>
          {error && <div style={errorStyle}>{error}</div>}

          <div style={sectionTitleStyle}>Organization Information</div>

          <label style={labelStyle}>
            Organization Name
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Lapu-Lapu City College"
              required
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Organization Slug
            <input
              type="text"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              placeholder="e.g. llcc"
              required
              style={{
                ...inputStyle,
                borderColor: isSlugValid ? 'rgba(255, 255, 255, 0.1)' : '#ef4444',
              }}
            />
            <span style={isSlugValid ? helperStyle : helperErrorStyle}>
              URL will be: {orgSlug ? `${orgSlug.toLowerCase()}.eas.arrowtest.site` : 'slug.eas.arrowtest.site'} (lowercase, alphanumeric, hyphens)
            </span>
          </label>

          <div style={labelStyle}>
            Organization Type
            <div style={radioContainerStyle}>
              <button
                type="button"
                onClick={() => setOrgType('SCHOOL')}
                style={{
                  ...radioButtonStyle,
                  background: orgType === 'SCHOOL' ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' : 'rgba(255, 255, 255, 0.05)',
                  borderColor: orgType === 'SCHOOL' ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
                }}
              >
                School
              </button>
              <button
                type="button"
                onClick={() => setOrgType('ORG')}
                style={{
                  ...radioButtonStyle,
                  background: orgType === 'ORG' ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' : 'rgba(255, 255, 255, 0.05)',
                  borderColor: orgType === 'ORG' ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
                }}
              >
                Other Org
              </button>
            </div>
          </div>

          <div style={{ ...sectionTitleStyle, marginTop: 12 }}>Administrator Details</div>

          <label style={labelStyle}>
            Full Name
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="e.g. Juan dela Cruz"
              required
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Email Address
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="e.g. admin@llcc.edu"
              required
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Password
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              style={{
                ...inputStyle,
                borderColor: isPasswordValid ? 'rgba(255, 255, 255, 0.1)' : '#ef4444',
              }}
            />
            {!isPasswordValid && (
              <span style={helperErrorStyle}>Password must be at least 8 characters long.</span>
            )}
          </label>

          <button
            type="submit"
            disabled={busy || !isSlugValid || !isPasswordValid}
            style={{
              ...submitButtonStyle,
              opacity: (busy || !isSlugValid || !isPasswordValid) ? 0.6 : 1,
              cursor: (busy || !isSlugValid || !isPasswordValid) ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Registering Tenant...' : 'Register Organization'}
          </button>
        </form>

        <footer style={footerStyle}>
          <p style={footerTextStyle}>
            Already have an organization?{' '}
            <Link href="/login" style={linkStyle}>
              Sign In
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}

// STYLES
const containerStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(circle at top left, #1e1b4b 0%, #0f172a 100%)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#f8fafc',
  padding: '24px',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  background: 'rgba(15, 23, 42, 0.75)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
  borderRadius: '16px',
  padding: '36px',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '28px',
  fontWeight: 800,
  letterSpacing: '-0.5px',
  background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const subtitleStyle: React.CSSProperties = {
  margin: '8px 0 0 0',
  color: '#94a3b8',
  fontSize: '14px',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#6366f1',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
  paddingBottom: '6px',
  marginBottom: '4px',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontSize: '13px',
  fontWeight: 500,
  color: '#cbd5e1',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  background: 'rgba(255, 255, 255, 0.04)',
  color: '#f8fafc',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const helperStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#64748b',
  marginTop: '2px',
};

const helperErrorStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#ef4444',
  marginTop: '2px',
};

const radioContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '4px',
};

const radioButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid',
  color: 'white',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  textAlign: 'center',
};

const submitButtonStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: '8px',
  border: 'none',
  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  color: 'white',
  fontWeight: 700,
  fontSize: '15px',
  boxShadow: '0 4px 14px 0 rgba(99, 102, 241, 0.3)',
  transition: 'transform 0.15s, box-shadow 0.15s',
  marginTop: '8px',
};

const errorStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '8px',
  background: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#fca5a5',
  fontSize: '13px',
  lineHeight: '1.4',
};

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: '8px',
};

const footerTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  color: '#94a3b8',
};

const linkStyle: React.CSSProperties = {
  color: '#818cf8',
  textDecoration: 'none',
  fontWeight: 600,
};

// Success state styles
const successIconContainer: React.CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  background: 'rgba(16, 185, 129, 0.15)',
  border: '2px solid rgba(16, 185, 129, 0.3)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto',
};

const successSvg: React.CSSProperties = {
  width: '36px',
  height: '36px',
  color: '#10b981',
};

const successTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '22px',
  fontWeight: 700,
  textAlign: 'center',
  color: '#10b981',
};

const successTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  color: '#cbd5e1',
  textAlign: 'center',
  lineHeight: '1.5',
};

const redirectTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  color: '#64748b',
  textAlign: 'center',
};
