import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Scan from './routes/Scan';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/scan/:eventId" element={<Scan />} />
        <Route path="/" element={<ScanRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
function ScanRedirect() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    const eid = params.get('eventId');
    if (eid) navigate(`/scan/${eid}`, { replace: true });
  }, [params, navigate]);
  return (
    <main style={{ padding: 24, color: '#e2e8f0', background: '#0f172a', minHeight: '100dvh', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 18 }}>EAS Scanner</h1>
      <p style={{ color: '#94a3b8' }}>Open <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4 }}>/scan/&lt;eventId&gt;</code> to start.</p>
    </main>
  );
}
