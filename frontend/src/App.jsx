import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ToastContainer } from './components/ui/ToastContainer.jsx';
import { useOfflineSync } from './hooks/useOfflineSync.js';
import { useEffect, useState } from 'react';
import LandingPage      from './pages/LandingPage.jsx';
import LoginPage        from './pages/LoginPage.jsx';
import JoinPage         from './pages/JoinPage.jsx';
import SetupCampaign    from './pages/SetupCampaign.jsx';
import DirectorLayout   from './pages/DirectorLayout.jsx';
import CoordinatorLayout from './pages/CoordinatorLayout.jsx';
import AgentLayout      from './pages/AgentLayout.jsx';
import NotFoundPage     from './pages/NotFoundPage.jsx';
import SettingsPage     from './pages/SettingsPage.jsx';

function LoadingScreen() {
  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" aria-label="Loading" />
    </div>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on=()=>setOffline(false), off=()=>setOffline(true);
    window.addEventListener('online',on); window.addEventListener('offline',off);
    return ()=>{ window.removeEventListener('online',on); window.removeEventListener('offline',off); };
  },[]);
  if (!offline) return null;
  return (
    <div className="offline-banner" role="alert" aria-live="assertive">
      You're offline — changes will sync when reconnected
    </div>
  );
}

function RoleRouter({ user }) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.role==='director' && !user.campaign_id) return <Navigate to="/setup-campaign" replace />;
  if (user.role==='director')    return <Navigate to="/director/dashboard" replace />;
  if (user.role==='coordinator') return <Navigate to="/coordinator/dashboard" replace />;
  if (user.role==='agent')       return <Navigate to="/agent/dashboard" replace />;
  return <Navigate to="/login" replace />;
}

function AppShell() {
  useOfflineSync();
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return (
    <Routes>
      {/* Public */}
      <Route path="/login"          element={<LoginPage />} />
      <Route path="/join"           element={<JoinPage />} />

      {/* Setup — director only, pre-campaign */}
      <Route path="/setup-campaign" element={user ? <SetupCampaign /> : <Navigate to="/login" replace />} />

      {/* Shared settings */}
      <Route path="/settings"       element={user ? <SettingsPage /> : <Navigate to="/login" replace />} />

      {/* Role layouts — each layout manages its own nested routes */}
      <Route path="/director/*"     element={user?.role==='director'    ? <DirectorLayout />    : <Navigate to="/login" replace />} />
      <Route path="/coordinator/*"  element={user?.role==='coordinator' ? <CoordinatorLayout /> : <Navigate to="/login" replace />} />
      <Route path="/agent/*"        element={user?.role==='agent'       ? <AgentLayout />       : <Navigate to="/login" replace />} />

      {/* Root — landing for guests, role redirect for authenticated users */}
      <Route path="/" element={user ? <RoleRouter user={user} /> : <LandingPage />} />

      {/* 404 — from 10_AUDIT.md Pass 3 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <OfflineBanner />
          <AppShell />
          <ToastContainer />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
