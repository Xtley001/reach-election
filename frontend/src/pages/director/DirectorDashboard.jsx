import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';

// North Star Ring — verbatim from 07_ANALYTICS.md
function NorthStarRing({ pct, confirmed, target }) {
  const r=54, circ=2*Math.PI*r, fill=(pct/100)*circ;
  const color=pct>=75?'var(--green)':pct>=40?'var(--amber)':'var(--red)';
  return (
    <div style={{textAlign:'center',padding:'24px 0'}}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--bg-3)" strokeWidth="12"/>
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={`${fill} ${circ}`} strokeDashoffset={circ/4}
          strokeLinecap="round" style={{transition:'stroke-dasharray 0.6s ease'}}/>
        <text x="70" y="65" textAnchor="middle" fill="var(--text)"
          fontSize="22" fontWeight="700" fontFamily="var(--font-display)">{pct}%</text>
        <text x="70" y="84" textAnchor="middle" fill="var(--text-2)" fontSize="11">of target</text>
      </svg>
      <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)',marginTop:'8px'}}>
        {confirmed.toLocaleString()} PVC-confirmed of {target.toLocaleString()} needed
      </p>
    </div>
  );
}

// Zone Comparison Table — verbatim from 07_ANALYTICS.md
function ZoneTable({ zones }) {
  if (!zones?.length) return <p style={{color:'var(--text-3)',fontSize:'var(--text-sm)',padding:'var(--space-4)'}}>No zones yet.</p>;
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'var(--text-sm)'}}>
        <thead>
          <tr style={{borderBottom:'2px solid var(--border)'}}>
            {['Zone','Voters','Support Rate','PVC Confirmed','PVC Gap','PU Coverage'].map(h=>(
              <th key={h} style={{padding:'10px 12px',textAlign:'left',color:'var(--text-2)',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zones.map(z=>(
            <tr key={z.zone_id} style={{borderBottom:'1px solid var(--border)'}}>
              <td style={{padding:'10px 12px',fontWeight:600}}>{z.zone_name}</td>
              <td style={{padding:'10px 12px'}}>{z.total_voters.toLocaleString()}</td>
              <td style={{padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span>{z.support_rate}%</span>
                  <span className={`badge badge-${z.support_rate>=60?'green':z.support_rate>=40?'amber':'red'}`}>
                    {z.support_rate>=60?'Strong':z.support_rate>=40?'OK':'Weak'}
                  </span>
                </div>
              </td>
              <td style={{padding:'10px 12px'}}>{z.pvc_confirmed.toLocaleString()}</td>
              <td style={{padding:'10px 12px',color:z.pvc_gap>0?'var(--red)':'var(--green)',fontWeight:600}}>
                {z.pvc_gap.toLocaleString()}
              </td>
              <td style={{padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div className="progress-track" style={{width:60}}>
                    <div className="progress-fill" style={{width:`${z.pu_coverage}%`}}/>
                  </div>
                  <span>{z.pu_coverage}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Voter Log Rate Chart — verbatim from 07_ANALYTICS.md
function LogRateChart({ data }) {
  if (!data?.length) return <p style={{color:'var(--text-3)',fontSize:'var(--text-sm)',padding:'var(--space-4)'}}>No data yet.</p>;
  return (
    <div style={{height:200}}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{top:4,right:4,left:-24,bottom:0}}>
          <XAxis dataKey="day" tick={{fontSize:11,fill:'var(--text-3)'}} tickFormatter={d=>d.slice(5)}/>
          <YAxis tick={{fontSize:11,fill:'var(--text-3)'}}/>
          <Tooltip contentStyle={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:12}}/>
          <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{r:4}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DirectorDashboard() {
  const [data,setData]     = useState(null);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{
    api.directorDash().then(setData).catch(e=>toast.error('Failed to load dashboard.')).finally(()=>setLoading(false));
  },[]);

  async function exportVoters() {
    try {
      const r=await api.exportVoters();
      const blob=await r.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download='voters.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch(e){ toast.error('Export failed.'); }
  }

  async function exportContacts() {
    try {
      const r=await api.exportContacts();
      const blob=await r.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download='contacts.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch(e){ toast.error('Export failed.'); }
  }

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'var(--space-12)'}}><div className="spinner"/></div>;
  if (!data)   return <p style={{padding:'var(--space-5)',color:'var(--text-2)'}}>No data available.</p>;

  const northStarColor = data.north_star_pct>=75?'green':data.north_star_pct>=40?'amber':'red';

  return (
    <div style={{padding:'var(--space-5)',maxWidth:960,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'var(--space-6)'}}>
        <div>
          <h1 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-xl)',fontWeight:700}}>Director Dashboard</h1>
          <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)',marginTop:2}}>Campaign overview</p>
        </div>
        <div style={{display:'flex',gap:'var(--space-2)'}}>
          <Button size="sm" variant="outline" onClick={exportVoters}>Export Voters CSV</Button>
          <Button size="sm" variant="outline" onClick={exportContacts}>Export Contacts CSV</Button>
        </div>
      </div>

      {/* North Star + key stats */}
      <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:'var(--space-4)',marginBottom:'var(--space-5)'}}>
        <div className="card-elevated" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
          <NorthStarRing pct={data.north_star_pct} confirmed={data.confirmed_pvc} target={data.target_vote_count||0}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'var(--space-3)'}}>
          <div className="stat-card">
            <span className="stat-value">{data.confirmed_pvc.toLocaleString()}</span>
            <span className="stat-label">PVC Confirmed</span>
            <span className={`stat-delta ${northStarColor==='green'?'up':'down'}`}>{data.north_star_pct}% of target</span>
          </div>
          <div className="stat-card">
            <span className="stat-value" style={{color:'var(--red)'}}>{data.pvc_gap.toLocaleString()}</span>
            <span className="stat-label">PVC Gap</span>
            <span className="stat-delta down">Supporters without PVC</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{data.total_voters.toLocaleString()}</span>
            <span className="stat-label">Voters Logged</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{data.pu_coverage_pct}%</span>
            <span className="stat-label">PU Coverage</span>
            <span className="stat-delta">{data.pus_with_voters} of {data.total_pus} polling units</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{data.messages_sent.toLocaleString()}</span>
            <span className="stat-label">Messages Sent</span>
            <span className="stat-delta">{data.messages_sent_this_week} this week</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{data.confirmed_supporters.toLocaleString()}</span>
            <span className="stat-label">Supporters</span>
            <span className="stat-delta">{data.total_agents||data.agent_stats?.length||0} agents</span>
          </div>
        </div>
      </div>

      {/* Log rate chart */}
      <div className="card" style={{marginBottom:'var(--space-4)'}}>
        <p style={{fontWeight:600,fontSize:'var(--text-sm)',marginBottom:'var(--space-3)'}}>Voter Log Rate — Last 7 Days</p>
        <LogRateChart data={data.daily_log_rate}/>
      </div>

      {/* Zone table */}
      <div className="card" style={{marginBottom:'var(--space-4)'}}>
        <p style={{fontWeight:600,fontSize:'var(--text-sm)',marginBottom:'var(--space-3)'}}>Zone Comparison</p>
        <ZoneTable zones={data.zone_stats}/>
      </div>

      {/* Agent performance */}
      {data.agent_stats?.length>0&&(
        <div className="card">
          <p style={{fontWeight:600,fontSize:'var(--text-sm)',marginBottom:'var(--space-3)'}}>Agent Performance</p>
          <div style={{display:'flex',flexDirection:'column',gap:'var(--space-2)'}}>
            {data.agent_stats.map(a=>(
              <div key={a.agent_id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'var(--space-2) 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <p style={{fontWeight:600,fontSize:'var(--text-sm)'}}>{a.agent_name||'—'}</p>
                  <p style={{fontSize:'var(--text-xs)',color:'var(--text-3)'}}>{a.zone_name}</p>
                </div>
                <div style={{display:'flex',gap:'var(--space-3)',alignItems:'center'}}>
                  <span style={{fontSize:'var(--text-xs)',color:'var(--text-2)'}}>{a.voters_logged} voters</span>
                  <span style={{fontSize:'var(--text-xs)',color:'var(--text-2)'}}>{a.messages_sent} msgs</span>
                  {a.is_inactive_flag&&<Badge variant="amber">Inactive</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
