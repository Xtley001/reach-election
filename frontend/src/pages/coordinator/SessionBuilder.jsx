import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Button } from '../../components/ui/Button.jsx';

const STATUS_OPTS=[{v:'unreached',l:'Unreached'},{v:'pvc_issue',l:'PVC Issue'},{v:'needs_follow_up',l:'Needs Follow-up'},{v:'no_answer',l:'No Answer'},{v:'confirmed_voter',l:'Confirmed Voter'}];
const PVC_OPTS=[{v:'no_pvc',l:'No PVC'},{v:'unknown',l:'Unknown'},{v:'has_pvc',l:'Has PVC'}];
const SUPPORT_OPTS=[{v:'strong_supporter',l:'Strong Supporter'},{v:'leaning',l:'Leaning'},{v:'undecided',l:'Undecided'},{v:'soft_opposition',l:'Soft Opposition'}];

const defaultFilter={status:[],polling_unit_ids:[],pvc_status:[],support_levels:[],agent_ids:[]};

function Toggle({label,checked,onChange}){return(<label style={{display:'flex',alignItems:'center',gap:'var(--space-2)',cursor:'pointer',fontSize:'var(--text-sm)',color:'var(--text-2)'}}>
  <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{width:16,height:16,accentColor:'var(--accent)',cursor:'pointer'}}/>{label}</label>);}

function MultiCheck({options,selected,onChange,label}){
  const toggle=v=>onChange(selected.includes(v)?selected.filter(x=>x!==v):[...selected,v]);
  return(<div><p className="field-label" style={{marginBottom:'var(--space-2)'}}>{label}</p><div style={{display:'flex',flexWrap:'wrap',gap:'var(--space-2)'}}>{options.map(o=><Toggle key={o.v} label={o.l} checked={selected.includes(o.v)} onChange={()=>toggle(o.v)}/>)}</div></div>);
}

export default function SessionBuilder(){
  const[templates,setTemplates]=useState([]);
  const[agents,setAgents]=useState([]);
  const[pus,setPUs]=useState([]);
  const[form,setForm]=useState({template_id:'',agent_ids:[],filter:defaultFilter});
  const[loading,setLoading]=useState(false);
  const[step,setStep]=useState(0);
  const navigate=useNavigate();

  useEffect(()=>{
    api.listTemplates().then(setTemplates).catch(()=>{});
    api.listAgents().then(setAgents).catch(()=>{});
    api.listPUs().then(setPUs).catch(()=>{});
  },[]);

  const setFilter=(k,v)=>setForm(f=>({...f,filter:{...f.filter,[k]:v}}));
  const toggleAgent=id=>setForm(f=>({...f,agent_ids:f.agent_ids.includes(id)?f.agent_ids.filter(x=>x!==id):[...f.agent_ids,id]}));

  async function create(){
    if(!form.template_id){toast.error('Select a template.');return;}
    if(!form.agent_ids.length){toast.error('Select at least one agent.');return;}
    setLoading(true);
    try{
      const sess=await api.createSession(form);
      toast.success(`Session created with ${sess.voter_count} voters.`);
      navigate('/coordinator/sessions');
    }catch(e){toast.error(e.message||'Failed to create session.');}
    finally{setLoading(false);}
  }

  const STEPS=['Template','Filters','Agents'];

  return(
    <div style={{padding:'var(--space-5)',maxWidth:560,margin:'0 auto'}}>
      <div style={{marginBottom:'var(--space-6)'}}>
        <h1 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-xl)',fontWeight:700}}>New Messaging Session</h1>
      </div>
      <div style={{display:'flex',gap:'var(--space-2)',marginBottom:'var(--space-6)'}}>
        {STEPS.map((s,i)=>(
          <div key={i} style={{flex:1}}>
            <div className="progress-track"><div className="progress-fill" style={{width:i<=step?'100%':'0%'}}/></div>
            <p style={{fontSize:'var(--text-xs)',marginTop:4,color:i===step?'var(--text)':'var(--text-3)',fontWeight:i===step?600:400}}>{s}</p>
          </div>
        ))}
      </div>

      <div className="card-elevated">
        {step===0&&(
          <div style={{display:'flex',flexDirection:'column',gap:'var(--space-4)'}}>
            <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)'}}>Choose the message template your agents will send.</p>
            {templates.length===0?<p style={{color:'var(--text-3)',fontSize:'var(--text-sm)'}}>No templates available. Ask your director to create one.</p>
            :templates.map(t=>(
              <label key={t.id} className={`card${form.template_id===t.id?' ':''}`}
                style={{cursor:'pointer',border:form.template_id===t.id?'1.5px solid var(--accent)':'1px solid var(--border)'}}>
                <input type="radio" name="template" value={t.id} checked={form.template_id===t.id}
                  onChange={()=>setForm(f=>({...f,template_id:t.id}))} style={{display:'none'}}/>
                <p style={{fontWeight:600,fontSize:'var(--text-sm)'}}>{t.label}</p>
                <p style={{fontSize:'var(--text-xs)',color:'var(--text-3)',marginTop:2,fontFamily:'var(--font-mono)',whiteSpace:'pre-wrap'}}>{t.body.slice(0,100)}…</p>
              </label>
            ))}
          </div>
        )}

        {step===1&&(
          <div style={{display:'flex',flexDirection:'column',gap:'var(--space-5)'}}>
            <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)'}}>Filter which voters will be included. Leave all unchecked to include all voters in your zone.</p>
            <MultiCheck label="Contact status" options={STATUS_OPTS} selected={form.filter.status} onChange={v=>setFilter('status',v)}/>
            <MultiCheck label="PVC status" options={PVC_OPTS} selected={form.filter.pvc_status} onChange={v=>setFilter('pvc_status',v)}/>
            <MultiCheck label="Support level" options={SUPPORT_OPTS} selected={form.filter.support_levels} onChange={v=>setFilter('support_levels',v)}/>
          </div>
        )}

        {step===2&&(
          <div style={{display:'flex',flexDirection:'column',gap:'var(--space-3)'}}>
            <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)',marginBottom:'var(--space-2)'}}>Select the agents who will send this session. Voters are distributed evenly.</p>
            {agents.length===0?<p style={{color:'var(--text-3)',fontSize:'var(--text-sm)'}}>No active agents in your zone.</p>
            :agents.map(a=>(
              <label key={a.id} className="card" style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'var(--space-3)',
                border:form.agent_ids.includes(a.id)?'1.5px solid var(--accent)':'1px solid var(--border)'}}>
                <input type="checkbox" checked={form.agent_ids.includes(a.id)} onChange={()=>toggleAgent(a.id)}
                  style={{width:18,height:18,accentColor:'var(--accent)',cursor:'pointer'}}/>
                <div>
                  <p style={{fontWeight:600,fontSize:'var(--text-sm)'}}>{a.name||a.phone}</p>
                  <p style={{fontSize:'var(--text-xs)',color:'var(--text-3)'}}>{a.phone}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        <div style={{display:'flex',justifyContent:'space-between',marginTop:'var(--space-6)',paddingTop:'var(--space-5)',borderTop:'1px solid var(--border)'}}>
          <Button variant="ghost" onClick={()=>setStep(s=>s-1)} disabled={step===0||loading}>← Back</Button>
          {step<STEPS.length-1
            ?<Button variant="primary" onClick={()=>setStep(s=>s+1)}>Continue →</Button>
            :<Button variant="primary" onClick={create} disabled={loading}>{loading?'Creating…':'Create Session'}</Button>}
        </div>
      </div>
    </div>
  );
}
