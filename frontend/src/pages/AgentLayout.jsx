import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import AddVoterPage   from './agent/AddVoterPage.jsx';
import VotersListPage from './agent/VotersListPage.jsx';
import CallQueuePage  from './agent/CallQueuePage.jsx';
import AgentSession    from './agent/AgentSession.jsx';
import AgentDashboard  from './agent/AgentDashboard.jsx';
import SettingsPage    from './SettingsPage.jsx';
import { Icon } from '../components/ui/Icon.jsx';

const NAV=[
  {to:'/agent/dashboard', label:'Home',   icon:'home'},
  {to:'/agent/queue',     label:'Queue',  icon:'queue'},
  {to:'/agent/voters',    label:'Voters', icon:'voters'},
  {to:'/agent/add-voter', label:'Add',    icon:'add'},
  {to:'/agent/messages',  label:'Msgs',   icon:'messaging'},
];

export default function AgentLayout(){
  const{logout}=useAuth();
  const navigate=useNavigate();
  return(
    <div style={{minHeight:'100dvh',background:'var(--bg)'}}>
      {/* Agents have no sidebar — the bottom tab bar persists on every width. */}
      <nav className="bottom-nav bottom-nav--persist">
        {NAV.map(n=>(
          <NavLink key={n.to} to={n.to} className={({isActive})=>`bottom-nav-item${isActive?' active':''}`}>
            <span className="bottom-nav-icon"><Icon name={n.icon} size={22} /></span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="page-content" style={{marginLeft:0,paddingTop:'var(--space-4)',paddingBottom:'calc(64px + env(safe-area-inset-bottom,0))'}}>
        <div className="page-inner">
          <Routes>
            <Route path="dashboard"  element={<AgentDashboard/>}/>
            <Route path="queue"      element={<CallQueuePage/>}/>
            <Route path="voters"     element={<VotersListPage/>}/>
            <Route path="add-voter"  element={<AddVoterPage/>}/>
            <Route path="messages"   element={<AgentSession/>}/>
            <Route path="settings"   element={<SettingsPage/>}/>
            <Route path="*"          element={<Navigate to="dashboard" replace/>}/>
          </Routes>
        </div>
      </main>
    </div>
  );
}
