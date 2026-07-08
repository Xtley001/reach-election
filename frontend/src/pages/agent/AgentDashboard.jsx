import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { useAuth } from '../../hooks/useAuth.jsx';
import { contactStatusLabels } from '../../lib/labels';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';

export default function AgentDashboard() {
  const [data,setData]       = useState(null);
  const [loading,setLoading] = useState(true);
  const { user }             = useAuth();
  const navigate             = useNavigate();

  useEffect(()=>{
    api.agentDash().then(setData).catch(()=>toast.error('Failed to load.')).finally(()=>setLoading(false));
  },[]);

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'var(--space-12)'}}><div className="spinner"/></div>;
  if (!data)   return null;

  const pct = data.total_logged>0?Math.round(data.confirmed_voters/data.total_logged*100):0;

  return (
    <div style={{padding:'var(--space-5)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'var(--space-3)',marginBottom:'var(--space-5)'}}>
        <div>
          <h1 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-xl)',fontWeight:700}}>
            Good morning{user?.name?`, ${user.name.split(' ')[0]}`:''}
          </h1>
          <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)',marginTop:2}}>Here's your summary for today</p>
        </div>
        <button onClick={()=>navigate('/agent/settings')} aria-label="Settings"
          style={{flexShrink:0,width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-2)',overflow:'hidden',padding:0}}>
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
            : <Icon name="settings" size={20}/>}
        </button>
      </div>

      {/* Today strip */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'var(--space-3)',marginBottom:'var(--space-4)'}}>
        <div className="stat-card" style={{background:'var(--bg-2)'}}>
          <span className="stat-value">{data.added_today}</span>
          <span className="stat-label">Added today</span>
        </div>
        <div className="stat-card" style={{background:'var(--bg-2)'}}>
          <span className="stat-value">{data.sends_today}</span>
          <span className="stat-label">Messages today</span>
        </div>
      </div>

      {/* Main stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:'var(--space-3)',marginBottom:'var(--space-5)'}}>
        <div className="stat-card">
          <span className="stat-value">{data.total_logged}</span>
          <span className="stat-label">Total voters</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{color:'var(--green)'}}>{data.confirmed_voters}</span>
          <span className="stat-label">Confirmed</span>
          <span className="stat-delta up">{pct}%</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.queue_total}</span>
          <span className="stat-label">In queue</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.sends_this_week}</span>
          <span className="stat-label">Msgs this week</span>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{display:'flex',gap:'var(--space-3)',marginBottom:'var(--space-5)'}}>
        <Button variant="primary" style={{flex:1}} onClick={()=>navigate('/agent/add-voter')}>+ Add Voter</Button>
        <Button variant="outline" style={{flex:1}} onClick={()=>navigate('/agent/queue')}>📞 Call Queue ({data.queue_total})</Button>
      </div>

      {/* Queue breakdown */}
      {data.queue_breakdown?.length>0&&(
        <div className="card" style={{marginBottom:'var(--space-4)'}}>
          <p style={{fontWeight:600,fontSize:'var(--text-sm)',marginBottom:'var(--space-3)'}}>Queue Breakdown</p>
          <div style={{display:'flex',flexDirection:'column',gap:'var(--space-2)'}}>
            {data.queue_breakdown.map(q=>(
              <div key={q.status} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'var(--space-1) 0'}}>
                <span style={{fontSize:'var(--text-sm)',color:'var(--text-2)'}}>{contactStatusLabels[q.status]||q.status}</span>
                <span style={{fontSize:'var(--text-sm)',fontWeight:600,color:'var(--text)'}}>{q.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active sessions */}
      {data.active_sessions?.length>0&&(
        <div className="card">
          <p style={{fontWeight:600,fontSize:'var(--text-sm)',marginBottom:'var(--space-3)'}}>Active Sessions</p>
          {data.active_sessions.map(s=>(
            <div key={s.session_id} className="card-section" style={{marginBottom:'var(--space-2)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'var(--space-1)'}}>
                <p style={{fontWeight:600,fontSize:'var(--text-sm)'}}>{s.template_label}</p>
                <p style={{fontSize:'var(--text-xs)',color:'var(--text-3)'}}>{s.completion_pct}%</p>
              </div>
              <div className="progress-track">
                <div className="progress-fill progress-fill-green" style={{width:`${s.completion_pct}%`}}/>
              </div>
              <p style={{fontSize:'var(--text-xs)',color:'var(--text-3)',marginTop:4}}>{s.pending_count} remaining</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
