import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { toast } from '../lib/toast';
import TerritoryPage    from './director/TerritoryPage.jsx';
import TemplateManager   from './director/TemplateManager.jsx';
import DirectorDashboard  from './director/DirectorDashboard.jsx';
import VoterImportPage   from './director/VoterImportPage.jsx';
import { DarkModeToggle } from '../components/ui/DarkModeToggle.jsx';
import SettingsPage       from './SettingsPage.jsx';

const NAV = [
  { to: '/director/dashboard',  label: 'Dashboard',  icon: '📊' },
  { to: '/director/territory',  label: 'Territory',  icon: '🗺️'  },
  { to: '/director/team',       label: 'Team',       icon: '👥' },
  { to: '/director/voters',     label: 'Voters',     icon: '🗳️'  },
  { to: '/director/import',     label: 'Import',     icon: '📥' },
  { to: '/director/messaging',  label: 'Messaging',  icon: '💬' },
  { to: '/director/settings',   label: 'Settings',   icon: '⚙️'  },
];

function Placeholder({ title }) {
  return (
    <div style={{ padding:'40px 24px', textAlign:'center' }}>
      <h2 style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-xl)', marginBottom:8 }}>{title}</h2>
      <p style={{ color:'var(--text-2)' }}>Coming in next phase.</p>
    </div>
  );
}

export default function DirectorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg)' }}>
      {/* Sidebar — desktop */}
      <aside style={{
        position:'fixed', top:0, left:0, bottom:0, width:220,
        background:'var(--bg)', borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column',
        zIndex:90,
      }} className="sidebar">
        <div style={{ padding:'var(--space-5) var(--space-4)', borderBottom:'1px solid var(--border)' }}>
          <p style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'var(--text-md)', color:'var(--text)' }}>REACH</p>
          <p style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginTop:2 }}>Director</p>
        </div>
        <nav style={{ flex:1, padding:'var(--space-3) var(--space-2)', overflowY:'auto' }}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:'var(--space-3)',
              padding:'10px var(--space-3)', borderRadius:'var(--radius)',
              color: isActive ? 'var(--text)' : 'var(--text-2)',
              background: isActive ? 'var(--bg-2)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize:'var(--text-sm)', textDecoration:'none',
              marginBottom:2, transition:'all 0.12s ease',
            })}>
              <span>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding:'var(--space-4)', borderTop:'1px solid var(--border)' }}>
          <p style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginBottom:'var(--space-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {user?.name || user?.email || user?.phone}
          </p>
          <button onClick={handleLogout} style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-sans)', padding:0 }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Bottom nav — mobile */}
      <nav className="bottom-nav">
        {NAV.slice(0,5).map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
            <span className="bottom-nav-icon" style={{ fontSize:22 }}>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Main content */}
      <main style={{ marginLeft:0, minHeight:'100dvh' }} className="page-content">
        <Routes>
          <Route path="dashboard"  element={<DirectorDashboard />} />
          <Route path="territory"  element={<TerritoryPage />} />
          <Route path="team"       element={<Placeholder title="Team" />} />
          <Route path="voters"     element={<Placeholder title="Voters" />} />
          <Route path="import"     element={<VoterImportPage />} />
          <Route path="messaging"  element={<Placeholder title="Messaging" />} />
          <Route path="settings"   element={<SettingsPage />} />
          <Route path="templates"  element={<TemplateManager />} />
          <Route path="*"          element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
