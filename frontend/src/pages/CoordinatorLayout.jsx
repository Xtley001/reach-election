import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import CoordinatorDashboard from './coordinator/CoordinatorDashboard.jsx';
import SessionBuilder from './coordinator/SessionBuilder.jsx';
import ZoneVotersPage from './coordinator/ZoneVotersPage.jsx';
import MyAgentsPage from './coordinator/MyAgentsPage.jsx';

const NAV=[
  {to:'/coordinator/dashboard', label:'Dashboard', icon:'📊'},
  {to:'/coordinator/voters',    label:'Voters',    icon:'🗳️'},
  {to:'/coordinator/sessions',  label:'Sessions',  icon:'💬'},
  {to:'/coordinator/team',      label:'Team',      icon:'👥'},
];

export default function CoordinatorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div style={{minHeight:'100dvh',background:'var(--bg)'}}>
      <aside style={{position:'fixed',top:0,left:0,bottom:0,width:220,background:'var(--bg)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',zIndex:90}} className="sidebar">
        <div style={{padding:'var(--space-5) var(--space-4)',borderBottom:'1px solid var(--border)'}}>
          <p style={{fontFamily:'var(--font-display)',fontWeight:700,fontSize:'var(--text-md)'}}>REACH</p>
          <p style={{fontSize:'var(--text-xs)',color:'var(--text-3)',marginTop:2}}>Coordinator — {user?.name?.split(' ')[0]||'You'}</p>
        </div>
        <nav style={{flex:1,padding:'var(--space-3) var(--space-2)',overflowY:'auto'}}>
          {NAV.map(n=>(
            <NavLink key={n.to} to={n.to} style={({isActive})=>({
              display:'flex',alignItems:'center',gap:'var(--space-3)',padding:'10px var(--space-3)',borderRadius:'var(--radius)',
              color:isActive?'var(--text)':'var(--text-2)',background:isActive?'var(--bg-2)':'transparent',
              fontWeight:isActive?600:400,fontSize:'var(--text-sm)',textDecoration:'none',marginBottom:2,
            })}>
              <span>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{padding:'var(--space-4)',borderTop:'1px solid var(--border)'}}>
          <button onClick={async()=>{await logout();navigate('/login',{replace:true});}} style={{fontSize:'var(--text-xs)',color:'var(--text-3)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--font-sans)'}}>Sign out</button>
        </div>
      </aside>
      <nav className="bottom-nav">
        {NAV.map(n=>(
          <NavLink key={n.to} to={n.to} className={({isActive})=>`bottom-nav-item${isActive?' active':''}`}>
            <span className="bottom-nav-icon" style={{fontSize:22}}>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <main style={{minHeight:'100dvh'}} className="page-content">
        <div className="page-inner">
          <Routes>
            <Route path="dashboard" element={<CoordinatorDashboard/>}/>
            <Route path="voters"    element={<ZoneVotersPage/>}/>
            <Route path="sessions"  element={<SessionBuilder/>}/>
            <Route path="team"      element={<MyAgentsPage/>}/>
            <Route path="*"         element={<Navigate to="dashboard" replace/>}/>
          </Routes>
        </div>
      </main>
    </div>
  );
}
