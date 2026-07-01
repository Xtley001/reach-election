import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { contactStatusLabels, contactStatusVariant } from '../../lib/labels';
import { queueAction } from '../../lib/offline';

const STATUS_ACTIONS = [
  {s:'confirmed_voter', l:'✅ Confirmed', variant:'success'},
  {s:'pvc_issue',       l:'⚠️ PVC Issue', variant:'outline'},
  {s:'no_answer',       l:'📵 No Answer', variant:'outline'},
  {s:'needs_follow_up', l:'🔁 Follow Up', variant:'outline'},
  {s:'wrong_number',    l:'❌ Wrong #',   variant:'outline'},
  {s:'declined',        l:'🚫 Declined',  variant:'outline'},
];

export default function CallQueuePage(){
  const[queue,setQueue]=useState([]);
  const[loading,setLoading]=useState(true);
  const[current,setCurrent]=useState(0);
  const[logging,setLogging]=useState(false);

  async function load(){
    setLoading(true);
    try{setQueue(await api.getQueue());}catch(e){toast.error('Failed to load queue.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);

  const voter=queue[current];

  async function logStatus(status){
    if(!voter)return;setLogging(true);
    const payload={status_set:status,channel:'call'};
    try{
      if(!navigator.onLine){await queueAction('log_contact',{voter_id:voter.id,...payload});toast.info('Saved offline.');}
      else{await api.logContact(voter.id,payload);toast.success('Status logged.');}
      const next=[...queue];next.splice(current,1);setQueue(next);
      if(current>=next.length&&current>0)setCurrent(c=>c-1);
    }catch(e){toast.error(e.message||'Failed to log.');}
    finally{setLogging(false);}
  }

  if(loading)return(<div style={{display:'flex',justifyContent:'center',padding:'var(--space-12)'}}><div className="spinner"/></div>);

  if(!voter)return(
    <div style={{padding:'var(--space-5)',textAlign:'center'}}>
      <p style={{fontSize:'var(--text-3xl)',marginBottom:'var(--space-3)'}}>🎉</p>
      <h2 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-xl)',fontWeight:700,marginBottom:'var(--space-2)'}}>Queue complete!</h2>
      <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)',marginBottom:'var(--space-5)'}}>No more voters in your priority queue.</p>
      <Button variant="outline" onClick={load}>Refresh Queue</Button>
    </div>
  );

  const progress=current/(queue.length||1)*100;

  return(
    <div style={{padding:'var(--space-5)',maxWidth:480,margin:'0 auto'}}>
      <div style={{marginBottom:'var(--space-5)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'var(--space-2)'}}>
          <h1 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-xl)',fontWeight:700}}>Call Queue</h1>
          <span style={{fontSize:'var(--text-sm)',color:'var(--text-2)'}}>{current+1} / {queue.length}</span>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{width:`${progress}%`}}/></div>
      </div>

      {/* Voter card */}
      <div className="card-elevated" style={{marginBottom:'var(--space-5)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'var(--space-4)'}}>
          <div>
            <h2 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-lg)',fontWeight:700}}>{voter.name}</h2>
            <a href={`tel:${voter.phone}`} style={{fontSize:'var(--text-xl)',fontWeight:700,color:'var(--green)',display:'block',marginTop:'var(--space-1)',textDecoration:'none'}}>
              📞 {voter.phone}
            </a>
          </div>
          <Badge variant={contactStatusVariant[voter.current_status]||'grey'}>
            {contactStatusLabels[voter.current_status]||voter.current_status}
          </Badge>
        </div>

        {voter.notes&&(
          <div className="card-section" style={{marginBottom:'var(--space-3)'}}>
            <p style={{fontSize:'var(--text-xs)',color:'var(--text-3)',marginBottom:2}}>NOTES</p>
            <p style={{fontSize:'var(--text-sm)',color:'var(--text)'}}>{voter.notes}</p>
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'var(--space-2)',marginTop:'var(--space-3)'}}>
          {STATUS_ACTIONS.map(a=>(
            <Button key={a.s} variant={a.variant} size="sm" onClick={()=>logStatus(a.s)} disabled={logging}>
              {a.l}
            </Button>
          ))}
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'space-between'}}>
        <Button variant="ghost" size="sm" onClick={()=>setCurrent(c=>Math.max(0,c-1))} disabled={current===0}>← Prev</Button>
        <Button variant="ghost" size="sm" onClick={()=>setCurrent(c=>Math.min(queue.length-1,c+1))} disabled={current>=queue.length-1}>Next →</Button>
      </div>
    </div>
  );
}
