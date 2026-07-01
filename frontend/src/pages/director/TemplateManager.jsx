import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';

const MERGE = ['{{voter_name}}','{{agent_name}}','{{candidate_name}}','{{polling_unit_name}}'];
const CHANNELS = [{v:'both',l:'WhatsApp + SMS'},{v:'whatsapp',l:'WhatsApp only'},{v:'sms',l:'SMS only'}];
const EMPTY = {label:'',body:'',channel:'both'};

function Modal({title,onClose,children}){
  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'var(--space-5)'}}>
    <div className="card-elevated" style={{width:'100%',maxWidth:520,maxHeight:'90dvh',overflowY:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'var(--space-5)'}}>
        <h3 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-lg)',fontWeight:600}}>{title}</h3>
        <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-2)'}}>✕</button>
      </div>
      {children}
    </div>
  </div>);
}

export default function TemplateManager(){
  const[templates,setTemplates]=useState([]);
  const[form,setForm]=useState(EMPTY);
  const[editing,setEditing]=useState(null);
  const[loading,setLoading]=useState(false);
  const[modal,setModal]=useState(null);
  const[preview,setPreview]=useState(null);

  async function load(){try{setTemplates(await api.listTemplates());}catch(e){toast.error('Failed to load templates.');}}
  useEffect(()=>{load();},[]);

  const set=(f,v)=>setForm(p=>({...p,[f]:v}));
  const charLeft=1000-(form.body?.length||0);

  async function save(){
    if(!form.label.trim()||!form.body.trim()){toast.error('Label and body are required.');return;}
    setLoading(true);
    try{
      if(editing){await api.updateTemplate(editing,form);}
      else{await api.createTemplate(form);}
      toast.success(editing?'Template updated.':'Template created.');
      setModal(null);setEditing(null);setForm(EMPTY);await load();
    }catch(e){toast.error(e.message||'Failed to save.');}
    finally{setLoading(false);}
  }

  async function deactivate(id){
    if(!window.confirm('Deactivate this template?'))return;
    try{await api.deleteTemplate(id);toast.success('Template deactivated.');await load();}
    catch(e){toast.error(e.message);}
  }

  function insertField(field){set('body',(form.body||'')+field);}

  return(
    <div style={{padding:'var(--space-5)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'var(--space-6)'}}>
        <div>
          <h1 style={{fontFamily:'var(--font-display)',fontSize:'var(--text-xl)',fontWeight:700}}>Message Templates</h1>
          <p style={{color:'var(--text-2)',fontSize:'var(--text-sm)',marginTop:2}}>{templates.length} active template{templates.length!==1?'s':''}</p>
        </div>
        <Button variant="primary" size="sm" onClick={()=>{setForm(EMPTY);setEditing(null);setModal('form');}}>+ Template</Button>
      </div>

      {templates.length===0?(
        <div className="card" style={{textAlign:'center',padding:'var(--space-10)',color:'var(--text-3)'}}>
          <p style={{fontSize:'var(--text-2xl)',marginBottom:'var(--space-2)'}}>💬</p>
          <p style={{fontWeight:600,color:'var(--text-2)'}}>No templates yet</p>
          <p style={{fontSize:'var(--text-sm)',marginTop:'var(--space-1)'}}>Create a message template for your agents to send.</p>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:'var(--space-3)'}}>
          {templates.map(t=>(
            <div key={t.id} className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{flex:1,marginRight:'var(--space-4)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'var(--space-2)',marginBottom:'var(--space-1)'}}>
                    <p style={{fontWeight:600,fontSize:'var(--text-base)'}}>{t.label}</p>
                    <Badge variant="blue">{t.channel}</Badge>
                  </div>
                  <p style={{fontSize:'var(--text-sm)',color:'var(--text-2)',lineHeight:'var(--leading-normal)',fontFamily:'var(--font-mono)',whiteSpace:'pre-wrap'}}>{t.body.slice(0,120)}{t.body.length>120?'…':''}</p>
                </div>
                <div style={{display:'flex',gap:'var(--space-2)',flexShrink:0}}>
                  <Button size="sm" variant="outline" onClick={()=>{setForm({label:t.label,body:t.body,channel:t.channel});setEditing(t.id);setModal('form');}}>Edit</Button>
                  <Button size="sm" variant="ghost" style={{color:'var(--red)'}} onClick={()=>deactivate(t.id)}>✕</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal==='form'&&(
        <Modal title={editing?'Edit Template':'New Template'} onClose={()=>{setModal(null);setEditing(null);setForm(EMPTY);}}>
          <div style={{display:'flex',flexDirection:'column',gap:'var(--space-4)'}}>
            <div>
              <label className="field-label" style={{display:'block',marginBottom:'var(--space-2)'}}>Label</label>
              <input className="input" placeholder="e.g. PVC Reminder" value={form.label} onChange={e=>set('label',e.target.value)}/>
            </div>
            <div>
              <label className="field-label" style={{display:'block',marginBottom:'var(--space-2)'}}>Channel</label>
              <select className="input" value={form.channel} onChange={e=>set('channel',e.target.value)}>
                {CHANNELS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'var(--space-2)'}}>
                <label className="field-label">Message body</label>
                <span style={{fontSize:'var(--text-xs)',color:charLeft<0?'var(--red)':'var(--text-3)'}}>{charLeft} chars left</span>
              </div>
              <textarea className={`input${charLeft<0?' input-error':''}`} value={form.body} onChange={e=>set('body',e.target.value)}
                placeholder="Good morning {{voter_name}}, this is {{agent_name}}…" style={{height:140,resize:'vertical',fontFamily:'var(--font-mono)',fontSize:'var(--text-sm)'}}/>
              <div style={{display:'flex',flexWrap:'wrap',gap:'var(--space-1)',marginTop:'var(--space-2)'}}>
                {MERGE.map(f=>(
                  <button key={f} onClick={()=>insertField(f)} style={{fontSize:'var(--text-xs)',padding:'2px 8px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',background:'var(--bg-2)',cursor:'pointer',fontFamily:'var(--font-mono)',color:'var(--text-2)'}}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="primary" onClick={save} disabled={loading||charLeft<0}>
              {loading?'Saving…':editing?'Update Template':'Create Template'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
