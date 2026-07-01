import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import AddVoterPage   from './agent/AddVoterPage.jsx';
import VotersListPage from './agent/VotersListPage.jsx';
import CallQueuePage  from './agent/CallQueuePage.jsx';
import AgentSession    from './agent/AgentSession.jsx';
import AgentDashboard  from './agent/AgentDashboard.jsx';

function Placeholder({title}){return(<div style={{padding:'40px 24px',textAlign:'center'}}><h2 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-xl)',marginBottom:8}}>{title}</h2><p style={{color:'var(--text-2)'}}>Coming soon.</p></div>);}

const NAV=[
  {to:'/agent/dashboard', label:'Home',   icon:'🏠'},
  {to:'/agent/queue',     label:'Queue',  icon:'📞'},
  {to:'/agent/voters',    label:'Voters', icon:'🗳️'},
  {to:'/agent/add-voter', label:'Add',    icon:'➕'},
  {to:'/agent/messages',  label:'Msgs',   icon:'💬'},
];

export default function AgentLayout(){
  const{logout}=useAuth();
  const navigate=useNavigate();
  return(
    <div style={{minHeight:'100dvh',background:'var(--bg)'}}>
      <nav className="bottom-nav">
        {NAV.map(n=>(
          <NavLink key={n.to} to={n.to} className={({isActive})=>`bottom-nav-item${isActive?' active':''}`}>
            <span className="bottom-nav-icon" style={{fontSize:22}}>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="page-content" style={{paddingTop:'var(--space-4)'}}>
        <Routes>
          <Route path="dashboard"  element={<AgentDashboard/>}/>
          <Route path="queue"      element={<CallQueuePage/>}/>
          <Route path="voters"     element={<VotersListPage/>}/>
          <Route path="add-voter"  element={<AddVoterPage/>}/>
          <Route path="messages"   element={<AgentSession/>}/>
          <Route path="*"          element={<Navigate to="dashboard" replace/>}/>
        </Routes>
      </main>
    </div>
  );
}
