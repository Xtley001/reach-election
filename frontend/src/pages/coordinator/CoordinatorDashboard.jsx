import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Badge } from '../../components/ui/Badge.jsx';

export default function CoordinatorDashboard() {
  const [data,setData]       = useState(null);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{
    api.coordinatorDash().then(setData).catch(()=>toast.error('Failed to load dashboard.')).finally(()=>setLoading(false));
  },[]);

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'var(--space-12)'}}><div className="spinner"/></div>;
  if (!data)   return null;

  return (
    <div style={{padding:'var(--space-5)'}}>
      <div style={{marginBottom:'var(--space-6)'}}>
        <h1 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-xl)',fontWeight:700}}>{data.zone_name}</h1>
        <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)',marginTop:2}}>{data.campaign_name}</p>
      </div>

      {/* Stats grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'var(--space-3)',marginBottom:'var(--space-5)'}}>
        {[
          {v:data.total_voters,l:'Total Voters'},
          {v:data.confirmed_voters,l:'Confirmed',delta:`${data.support_rate}% support rate`},
          {v:data.pvc_confirmed,l:'PVC Confirmed'},
          {v:data.pvc_gap,l:'PVC Gap',red:true},
          {v:data.total_agents,l:'Active Agents'},
          {v:data.messages_sent,l:'Messages Sent'},
        ].map(s=>(
          <div key={s.l} className="stat-card">
            <span className="stat-value" style={s.red?{color:'var(--red)'}:{}}>{(s.v||0).toLocaleString()}</span>
            <span className="stat-label">{s.l}</span>
            {s.delta&&<span className="stat-delta">{s.delta}</span>}
          </div>
        ))}
      </div>

      {/* Agent table */}
      {data.agent_stats?.length>0&&(
        <div className="card">
          <p style={{fontWeight:600,fontSize:'var(--text-sm)',marginBottom:'var(--space-4)'}}>Agent Activity</p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'var(--text-sm)'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--border)'}}>
                  {['Agent','Phone','Voters','Messages','Last Active','Status'].map(h=>(
                    <th key={h} style={{padding:'8px 12px',textAlign:'left',color:'var(--text-2)',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.agent_stats.map(a=>(
                  <tr key={a.agent_id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 12px',fontWeight:600}}>{a.agent_name||'—'}</td>
                    <td style={{padding:'10px 12px',color:'var(--text-2)'}}>{a.phone||'—'}</td>
                    <td style={{padding:'10px 12px'}}>{a.voters_logged}</td>
                    <td style={{padding:'10px 12px'}}>{a.messages_sent}</td>
                    <td style={{padding:'10px 12px',color:'var(--text-3)',fontSize:'var(--text-xs)'}}>
                      {a.last_active_at?new Date(a.last_active_at).toLocaleDateString():'Never'}
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      <Badge variant={a.is_inactive_flag?'amber':'green'}>
                        {a.is_inactive_flag?'Inactive':'Active'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
