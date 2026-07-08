import { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import TerritoryPage        from './director/TerritoryPage.jsx';
import TemplateManager      from './director/TemplateManager.jsx';
import DirectorDashboard    from './director/DirectorDashboard.jsx';
import VoterImportPage      from './director/VoterImportPage.jsx';
import DirectorVotersPage   from './director/DirectorVotersPage.jsx';
import DirectorTeamPage     from './director/DirectorTeamPage.jsx';
import DirectorMessagingPage from './director/DirectorMessagingPage.jsx';
import SettingsPage         from './SettingsPage.jsx';
import { Icon }             from '../components/ui/Icon.jsx';

const NAV = [
  { to: '/director/dashboard',  label: 'Dashboard',  icon: 'dashboard'  },
  { to: '/director/territory',  label: 'Territory',  icon: 'territory'  },
  { to: '/director/team',       label: 'Team',       icon: 'team'       },
  { to: '/director/voters',     label: 'Voters',     icon: 'voters'     },
  { to: '/director/import',     label: 'Import',     icon: 'import'     },
  { to: '/director/messaging',  label: 'Messaging',  icon: 'messaging'  },
  { to: '/director/settings',   label: 'Settings',   icon: 'settings'   },
];

// Mobile bottom-nav shows 4 primary tabs + a "More" sheet for the rest.
const PRIMARY = NAV.slice(0, 4);
const OVERFLOW = NAV.slice(4);

export default function DirectorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg)' }}>
      {/* Sidebar — desktop only */}
      <aside style={{
        position:'fixed', top:0, left:0, bottom:0, width:220,
        background:'var(--bg)', borderRight:'1px solid var(--border)',
        zIndex:90,
      }} className="sidebar">
        <div style={{ padding:'var(--space-5) var(--space-4)', borderBottom:'1px solid var(--border)' }}>
          <p style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'var(--text-md)', color:'var(--text)' }}>REACH</p>
          <p style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginTop:2 }}>Director</p>
        </div>
        <nav style={{ flex:1, padding:'var(--space-3) var(--space-2)', overflowY:'auto' }}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} className="sidebar-link" style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:'var(--space-3)',
              padding:'10px var(--space-3)', borderRadius:'var(--radius)',
              color: isActive ? 'var(--text)' : 'var(--text-2)',
              background: isActive ? 'var(--bg-2)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize:'var(--text-sm)', marginBottom:2,
            })}>
              <Icon name={n.icon} size={18} />{n.label}
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

      {/* Bottom nav — mobile only */}
      <nav className="bottom-nav">
        {PRIMARY.map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
            <span className="bottom-nav-icon"><Icon name={n.icon} size={22} /></span>
            <span>{n.label}</span>
          </NavLink>
        ))}
        <button className="bottom-nav-item" onClick={() => setMoreOpen(true)} style={{ background:'none', border:'none', fontFamily:'var(--font-sans)' }}>
          <span className="bottom-nav-icon" style={{ fontSize:22, fontWeight:700, letterSpacing:1 }}>···</span>
          <span>More</span>
        </button>
      </nav>

      {/* "More" sheet — mobile overflow items */}
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:150, display:'flex', alignItems:'flex-end' }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width:'100%', borderRadius:'var(--radius-lg) var(--radius-lg) 0 0', padding:'var(--space-4)', paddingBottom:'calc(var(--space-4) + env(safe-area-inset-bottom,0))' }}>
            {OVERFLOW.map(n => (
              <NavLink key={n.to} to={n.to} onClick={() => setMoreOpen(false)} className="sidebar-link" style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', padding:'var(--space-3)', borderRadius:'var(--radius)', color:'var(--text)', fontSize:'var(--text-base)' }}>
                <Icon name={n.icon} size={20} />{n.label}
              </NavLink>
            ))}
            <button onClick={handleLogout} style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', padding:'var(--space-3)', width:'100%', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-sans)', color:'var(--red)', fontSize:'var(--text-base)' }}>
              <Icon name="logout" size={20} />Sign out
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="page-content" style={{ minHeight:'100dvh' }}>
        <div className="page-inner">
          <Routes>
            <Route path="dashboard"  element={<DirectorDashboard />} />
            <Route path="territory"  element={<TerritoryPage />} />
            <Route path="team"       element={<DirectorTeamPage />} />
            <Route path="voters"     element={<DirectorVotersPage />} />
            <Route path="import"     element={<VoterImportPage />} />
            <Route path="messaging"  element={<DirectorMessagingPage />} />
            <Route path="settings"   element={<SettingsPage />} />
            <Route path="templates"  element={<TemplateManager />} />
            <Route path="*"          element={<Navigate to="dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
