import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';

const ELECTION_LEVELS = [
  { value: 'governorship',   label: 'Governorship' },
  { value: 'senatorial',     label: 'Senatorial' },
  { value: 'house_of_reps',  label: 'House of Representatives' },
  { value: 'state_assembly', label: 'State Assembly' },
  { value: 'lga_chairman',   label: 'LGA Chairman' },
  { value: 'councillorship', label: 'Councillorship' },
];

const STEPS = ['Campaign Info', 'Candidate', 'Target'];
const EMPTY = { name:'', election_level:'governorship', state:'', constituency_name:'', party:'', candidate_name:'', target_vote_count:'' };

function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="field-label" style={{ display:'block', marginBottom:'var(--space-2)' }}>{label}</label>
      {children}
      {hint && !error && <p style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginTop:4 }}>{hint}</p>}
      {error && <p style={{ fontSize:'var(--text-xs)', color:'var(--red)', marginTop:4 }}>{error}</p>}
    </div>
  );
}

export default function SetupCampaign() {
  const [step,setStep]       = useState(0);
  const [form,setForm]       = useState(EMPTY);
  const [errors,setErrors]   = useState({});
  const [loading,setLoading] = useState(false);
  const { reload }           = useAuth();
  const navigate             = useNavigate();

  const set = (field,val) => { setForm(f=>({...f,[field]:val})); setErrors(e=>({...e,[field]:''})); };

  function validateStep() {
    const e = {};
    if (step===0) {
      if (!form.name.trim())              e.name              = 'Campaign name is required.';
      if (!form.state.trim())             e.state             = 'State is required.';
      if (!form.constituency_name.trim()) e.constituency_name = 'Constituency is required.';
    }
    if (step===1) {
      if (!form.party.trim())          e.party          = 'Party is required.';
      if (!form.candidate_name.trim()) e.candidate_name = 'Candidate name is required.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function next() {
    if (!validateStep()) return;
    if (step < STEPS.length-1) { setStep(s=>s+1); return; }
    setLoading(true);
    try {
      await api.createCampaign({ ...form, target_vote_count: form.target_vote_count ? parseInt(form.target_vote_count) : null });
      toast.success('Campaign created!');
      await reload();
      navigate('/director/territory', { replace: true });
    } catch(err) { toast.error(err.message || 'Failed to create campaign.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg-2)', display:'flex', alignItems:'center', justifyContent:'center', padding:'var(--space-6)' }}>
      <div style={{ width:'100%', maxWidth:480 }}>
        <div style={{ textAlign:'center', marginBottom:'var(--space-8)' }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-2xl)', fontWeight:700 }}>Set up your campaign</h1>
          <p style={{ color:'var(--text-2)', marginTop:'var(--space-1)', fontSize:'var(--text-sm)' }}>This takes about 2 minutes.</p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-6)' }}>
          {STEPS.map((s,i) => (
            <div key={i} style={{ flex:1 }}>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: i<=step ? '100%' : '0%' }} />
              </div>
              <p style={{ fontSize:'var(--text-xs)', marginTop:4, color: i===step ? 'var(--text)' : 'var(--text-3)', fontWeight: i===step ? 600 : 400 }}>{s}</p>
            </div>
          ))}
        </div>
        <div className="card-elevated">
          {step===0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
              <Field label="Campaign name" error={errors.name}>
                <Input placeholder="e.g. Adeyemi 2027" value={form.name} onChange={e=>set('name',e.target.value)} error={!!errors.name} />
              </Field>
              <Field label="Election type">
                <select className="input" value={form.election_level} onChange={e=>set('election_level',e.target.value)}>
                  {ELECTION_LEVELS.map(l=><option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                <Field label="State" error={errors.state}>
                  <Input placeholder="e.g. Oyo" value={form.state} onChange={e=>set('state',e.target.value)} error={!!errors.state} />
                </Field>
                <Field label="Constituency" error={errors.constituency_name}>
                  <Input placeholder="e.g. Ibadan North" value={form.constituency_name} onChange={e=>set('constituency_name',e.target.value)} error={!!errors.constituency_name} />
                </Field>
              </div>
            </div>
          )}
          {step===1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
              <Field label="Candidate full name" error={errors.candidate_name}>
                <Input placeholder="e.g. Adeyemi Rasheed" value={form.candidate_name} onChange={e=>set('candidate_name',e.target.value)} error={!!errors.candidate_name} />
              </Field>
              <Field label="Political party" error={errors.party}>
                <Input placeholder="e.g. APC" value={form.party} onChange={e=>set('party',e.target.value)} error={!!errors.party} />
              </Field>
            </div>
          )}
          {step===2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
              <Field label="Target vote count (optional)" hint="How many votes do you need to win?">
                <Input type="number" min="1" placeholder="e.g. 500000" value={form.target_vote_count} onChange={e=>set('target_vote_count',e.target.value)} />
              </Field>
              <div className="card-section">
                <p style={{ fontSize:'var(--text-sm)', color:'var(--text-2)', lineHeight:'var(--leading-normal)' }}>
                  After creating your campaign, you'll be taken to the Territory Builder to set up zones and polling units.
                </p>
              </div>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:'var(--space-6)', paddingTop:'var(--space-5)', borderTop:'1px solid var(--border)' }}>
            <Button variant="ghost" onClick={()=>setStep(s=>s-1)} disabled={step===0||loading}>← Back</Button>
            <Button variant="primary" onClick={next} disabled={loading}>
              {loading ? 'Creating…' : step < STEPS.length-1 ? 'Continue →' : 'Create Campaign'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
