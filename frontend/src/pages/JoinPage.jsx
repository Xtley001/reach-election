import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { OTPInput } from '../components/ui/OTPInput.jsx';

const E164_RE = /^\+[1-9]\d{7,14}$/;

export default function JoinPage() {
  const [params]              = useSearchParams();
  const token                 = params.get('token') || '';
  const [preview, setPreview] = useState(null);
  const [previewErr, setPErr] = useState('');
  const [step, setStep]       = useState('loading'); // loading|preview|phone|otp|done
  const [phone, setPhone]     = useState('');
  const [otp, setOtp]         = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState('sms');
  const { login }             = useAuth();
  const navigate              = useNavigate();

  useEffect(() => {
    if (!token) { setPErr('No invite token found. Check your link.'); setStep('error'); return; }
    api.previewInvite(token)
      .then(data => {
        setPreview(data);
        // Coordinator flow: OTP via email (no phone step needed if email is pre-set)
        setChannel(data.role === 'coordinator' ? 'email' : 'sms');
        setStep('preview');
      })
      .catch(err => { setPErr(err.message || 'Invalid or expired invite.'); setStep('error'); });
  }, [token]);

  async function handleStart() {
    // For agent: need phone first; for coordinator: go straight to OTP
    if (preview.role === 'agent' && !preview.invited_phone) {
      setStep('phone');
    } else {
      await sendOtp(preview.invited_phone || null);
    }
  }

  async function sendOtp(ph = null) {
    setLoading(true); setError('');
    try {
      const res = await api.claimInvite({ token, phone: ph || phone || undefined });
      if (res.step === 'otp_required') { setStep('otp'); }
    } catch(e) { setError(e.message || 'Failed to send code.'); }
    finally { setLoading(false); }
  }

  async function handlePhoneNext() {
    if (!E164_RE.test(phone)) { setError('Enter a valid phone in E.164 format, e.g. +2348012345678'); return; }
    setError('');
    await sendOtp(phone);
  }

  async function handleVerify() {
    if (otp.length < 6) { setError('Enter all 6 digits.'); return; }
    setLoading(true); setError('');
    try {
      const data = await api.claimInvite({ token, phone: phone || preview.invited_phone || undefined, otp });
      login(data.user, data.access_token);
      const role = data.user.role;
      toast.success(`Welcome! You're now an active ${role}.`);
      navigate(
        role === 'coordinator' ? '/coordinator/dashboard'
        : role === 'agent'     ? '/agent/dashboard'
        : '/',
        { replace: true }
      );
    } catch(e) { setError(e.message || 'Incorrect code.'); setOtp(''); }
    finally { setLoading(false); }
  }

  // Auto-submit OTP when complete
  useEffect(() => { if (otp.length === 6 && step === 'otp') handleVerify(); }, [otp]);

  const shell = (children) => (
    <div style={{ minHeight:'100dvh', background:'var(--bg-2)', display:'flex', alignItems:'center', justifyContent:'center', padding:'var(--space-6)' }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:'var(--space-6)' }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-2xl)', fontWeight:700 }}>REACH Election</h1>
        </div>
        <div className="card-elevated">{children}</div>
      </div>
    </div>
  );

  if (step === 'loading') return shell(
    <div style={{ display:'flex', justifyContent:'center', padding:'var(--space-8)' }}><div className="spinner" /></div>
  );

  if (step === 'error') return shell(
    <div style={{ textAlign:'center', padding:'var(--space-4)' }}>
      <p style={{ fontSize:'var(--text-2xl)', marginBottom:'var(--space-3)' }}>⚠️</p>
      <h2 style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-lg)', marginBottom:'var(--space-2)' }}>Invite unavailable</h2>
      <p style={{ color:'var(--text-2)', fontSize:'var(--text-sm)' }}>{previewErr}</p>
    </div>
  );

  if (step === 'preview') return shell(
    <>
      <div style={{ textAlign:'center', marginBottom:'var(--space-5)' }}>
        <p style={{ fontSize:'var(--text-3xl)', marginBottom:'var(--space-2)' }}>{preview.role === 'coordinator' ? '🗺️' : '🗳️'}</p>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-xl)', fontWeight:700, marginBottom:'var(--space-1)' }}>
          You've been invited
        </h2>
        <p style={{ color:'var(--text-2)', fontSize:'var(--text-sm)' }}>
          as a <strong style={{ color:'var(--text)' }}>{preview.role}</strong>
          {preview.zone_name ? ` in ${preview.zone_name}` : ''}
        </p>
      </div>
      <div className="card-section" style={{ marginBottom:'var(--space-5)' }}>
        {preview.campaign_name && <Row label="Campaign" value={preview.campaign_name} />}
        {preview.candidate_name && <Row label="Candidate" value={preview.candidate_name} />}
        {preview.party && <Row label="Party" value={preview.party} />}
        {preview.inviter_name && <Row label="Invited by" value={preview.inviter_name} />}
      </div>
      {preview.invited_name && (
        <p style={{ fontSize:'var(--text-sm)', color:'var(--text-2)', textAlign:'center', marginBottom:'var(--space-4)' }}>
          This invite is for <strong style={{ color:'var(--text)' }}>{preview.invited_name}</strong>
        </p>
      )}
      <Button variant="primary" size="lg" style={{ width:'100%' }} onClick={handleStart} disabled={loading}>
        {loading ? 'Sending code…' : 'Accept Invite →'}
      </Button>
    </>
  );

  if (step === 'phone') return shell(
    <>
      <h2 style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-xl)', fontWeight:700, marginBottom:'var(--space-1)' }}>Enter your phone</h2>
      <p style={{ color:'var(--text-2)', fontSize:'var(--text-sm)', marginBottom:'var(--space-5)' }}>
        We'll send a verification code to confirm it's you.
      </p>
      <div style={{ marginBottom:'var(--space-4)' }}>
        <label className="field-label" style={{ display:'block', marginBottom:'var(--space-2)' }}>Phone number</label>
        <Input type="tel" inputMode="tel" placeholder="+2348012345678" value={phone}
          onChange={e=>{ setPhone(e.target.value); setError(''); }}
          error={!!error} autoFocus
          onKeyDown={e=>e.key==='Enter' && handlePhoneNext()} />
        {error && <p style={{ color:'var(--red)', fontSize:'var(--text-xs)', marginTop:4 }}>{error}</p>}
      </div>
      <Button variant="primary" size="lg" style={{ width:'100%' }} onClick={handlePhoneNext} disabled={loading || !phone}>
        {loading ? 'Sending…' : 'Send code →'}
      </Button>
    </>
  );

  if (step === 'otp') return shell(
    <>
      <h2 style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-xl)', fontWeight:700, marginBottom:'var(--space-1)' }}>Enter your code</h2>
      <p style={{ color:'var(--text-2)', fontSize:'var(--text-sm)', marginBottom:'var(--space-5)' }}>
        Sent to <strong style={{ color:'var(--text)' }}>{phone || preview.invited_phone || preview.invited_email}</strong>
      </p>
      <div style={{ marginBottom:'var(--space-5)' }}>
        <OTPInput value={otp} onChange={setOtp} error={!!error} disabled={loading} />
        {error && <p style={{ color:'var(--red)', fontSize:'var(--text-xs)', marginTop:'var(--space-2)', textAlign:'center' }}>{error}</p>}
      </div>
      <Button variant="primary" size="lg" style={{ width:'100%' }} onClick={handleVerify} disabled={loading || otp.length<6}>
        {loading ? 'Verifying…' : 'Complete Setup'}
      </Button>
      <p style={{ textAlign:'center', marginTop:'var(--space-4)', fontSize:'var(--text-sm)', color:'var(--text-3)' }}>
        <button onClick={()=>{ setOtp(''); setStep(preview.role==='agent' && !preview.invited_phone ? 'phone' : 'preview'); }}
          style={{ background:'none', border:'none', color:'var(--text-2)', cursor:'pointer', fontFamily:'var(--font-sans)', fontSize:'var(--text-sm)' }}>
          ← Back
        </button>
      </p>
    </>
  );

  return null;
}

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'var(--space-2) 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', fontWeight:500 }}>{label}</span>
      <span style={{ fontSize:'var(--text-sm)', color:'var(--text)', fontWeight:600 }}>{value}</span>
    </div>
  );
}
