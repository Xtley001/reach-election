import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { contactStatusLabels, contactStatusVariant, pvcStatusLabels, pvcStatusVariant } from '../../lib/labels';

const STATUS_OPTS=['','unreached','contacted','no_answer','confirmed_voter','pvc_issue','needs_follow_up','wrong_number','unreachable','declined'];
const PVC_OPTS=['','has_pvc','no_pvc','unknown'];
const SUPPORT_OPTS=['','strong_supporter','leaning','undecided','soft_opposition','unknown'];

export default function VotersListPage(){
  const[voters,setVoters]=useState([]);
  const[total,setTotal]=useState(0);
  const[search,setSearch]=useState('');
  const[status,setStatus]=useState('');
  const[pvc,setPvc]=useState('');
  const[support,setSupport]=useState('');
  const[loading,setLoading]=useState(true);
  const navigate=useNavigate();

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const p={limit:50,offset:0};
      if(search)p.search=search;if(status)p.status=status;if(pvc)p.pvc_status=pvc;if(support)p.support_level=support;
      const data=await api.listVoters(p);setVoters(data.voters);setTotal(data.total);
    }catch(e){toast.error('Failed to load voters.');}
    finally{setLoading(false);}
  },[search,status,pvc,support]);

  useEffect(()=>{const t=setTimeout(load,300);return()=>clearTimeout(t);},[load]);

  return(
    <div style={{padding:'var(--space-5)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'var(--space-5)'}}>
        <div>
          <h1 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-xl)',fontWeight:700}}>My Voters</h1>
          <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)',marginTop:2}}>{total.toLocaleString()} voter{total!==1?'s':''}</p>
        </div>
        <Button variant="primary" size="sm" onClick={()=>navigate('/agent/add-voter')}>+ Add</Button>
      </div>

      {/* Filters */}
      <div style={{display:'grid',gridTemplateColumns:'1fr repeat(3,auto)',gap:'var(--space-2)',marginBottom:'var(--space-4)'}}>
        <input className="input" placeholder="Search name or phone…" value={search} onChange={e=>setSearch(e.target.value)} style={{height:40}}/>
        <select className="input" style={{height:40}} value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTS.slice(1).map(s=><option key={s} value={s}>{contactStatusLabels[s]||s}</option>)}
        </select>
        <select className="input" style={{height:40}} value={pvc} onChange={e=>setPvc(e.target.value)}>
          <option value="">All PVC</option>
          {PVC_OPTS.slice(1).map(s=><option key={s} value={s}>{pvcStatusLabels[s]||s}</option>)}
        </select>
        <select className="input" style={{height:40}} value={support} onChange={e=>setSupport(e.target.value)}>
          <option value="">All support</option>
          {SUPPORT_OPTS.slice(1).map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
      </div>

      {loading?(
        <div style={{display:'flex',justifyContent:'center',padding:'var(--space-12)'}}><div className="spinner"/></div>
      ):voters.length===0?(
        <div className="card" style={{textAlign:'center',padding:'var(--space-12)',color:'var(--text-3)'}}>
          <p style={{fontSize:'var(--text-2xl)',marginBottom:'var(--space-2)'}}>🗳️</p>
          <p style={{fontWeight:600,color:'var(--text-2)'}}>No voters found</p>
          <p style={{fontSize:'var(--text-sm)',marginTop:'var(--space-1)'}}>Try adjusting filters or add a new voter.</p>
          <Button variant="primary" size="sm" style={{marginTop:'var(--space-4)'}} onClick={()=>navigate('/agent/add-voter')}>Add first voter</Button>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:'var(--space-2)'}}>
          {voters.map(v=>(
            <div key={v.id} className="card" onClick={()=>navigate(`/agent/voters/${v.id}`)}
              style={{cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'var(--space-4)'}}>
              <div>
                <p style={{fontWeight:600,color:'var(--text)',fontSize:'var(--text-base)'}}>{v.name}</p>
                <p style={{fontSize:'var(--text-xs)',color:'var(--text-3)',marginTop:2}}>{v.phone}</p>
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                <Badge variant={contactStatusVariant[v.current_status]||'grey'}>
                  {contactStatusLabels[v.current_status]||v.current_status}
                </Badge>
                <Badge variant={pvcStatusVariant[v.pvc_status]||'grey'}>
                  {pvcStatusLabels[v.pvc_status]||v.pvc_status}
                </Badge>
              </div>
            </div>
          ))}
          {total>50&&<p style={{textAlign:'center',color:'var(--text-3)',fontSize:'var(--text-sm)',padding:'var(--space-4)'}}>Showing first 50 of {total}. Use filters to narrow down.</p>}
        </div>
      )}
    </div>
  );
}
