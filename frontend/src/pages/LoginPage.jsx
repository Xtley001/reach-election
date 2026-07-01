import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../lib/api';
import { OTPInput } from '../components/ui/OTPInput.jsx';
import { Button } from '../components/ui/Button.jsx';

const E164_RE = /^\+[1-9]\d{7,14}$/;

export default function LoginPage() {
  const [step, setStep]           = useState('identifier'); // 'identifier' | 'otp'
  const [channel, setChannel]     = useState('email');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp]             = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { login } = useAuth();
  const navigate  = useNavigate();
  const inputRef  = useRef(null);
  const timerRef  = useRef(null);

  // Focus input on mount / step change
  useEffect(() => {
    inputRef.current?.focus();
  }, [step, channel]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timerRef.current); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [countdown]);

  // Auto-submit when OTP is complete
  useEffect(() => {
    if (otp.length === 6 && step === 'otp') handleVerify();
  }, [otp]);

  function validateIdentifier() {
    if (channel === 'email') {
      if (!identifier.includes('@')) return 'Enter a valid email address.';
    } else {
      if (!E164_RE.test(identifier)) return 'Enter phone in E.164 format, e.g. +2348012345678';
    }
    return '';
  }

  async function handleSendOtp(e) {
    e?.preventDefault();
    const err = validateIdentifier();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      const data = await api.sendOtp(channel, identifier);
      setStep('otp');
      setCountdown(30);
    } catch (err) {
      setError(err.message || 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e?.preventDefault();
    if (otp.length < 6) { setError('Enter all 6 digits.'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await api.verifyOtp(channel, identifier, otp, { name: '' });
      login(data.user, data.access_token);
      // Role-based redirect
      const { role, campaign_id, is_new } = data.user;
      if ((is_new || !campaign_id) && role === 'director') {
        navigate('/setup-campaign', { replace: true });
      } else if (role === 'coordinator') {
        navigate('/coordinator/dashboard', { replace: true });
      } else if (role === 'agent') {
        navigate('/agent/dashboard', { replace: true });
      } else {
        navigate('/director/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Incorrect code. Please try again.');
      setOtp('');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    setError('');
    setOtp('');
    await handleSendOtp();
  }

  const otpError = !!error && step === 'otp';

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-6)',
    }}>
      {/* Logo / brand */}
      <div style={{ marginBottom: 'var(--space-8)', textAlign: 'center' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          fontWeight: 700,
          letterSpacing: '-0.025em',
          color: 'var(--text)',
        }}>REACH Election</h1>
        <p style={{ color: 'var(--text-2)', marginTop: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
          Voter mobilisation infrastructure
        </p>
      </div>

      <div className="card-elevated" style={{ width: '100%', maxWidth: 400 }}>

        {step === 'identifier' && (
          <>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              fontWeight: 600,
              marginBottom: 'var(--space-1)',
            }}>Sign in</h2>
            <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)' }}>
              We'll send you a verification code.
            </p>

            {/* Channel toggle */}
            <div style={{
              display: 'flex',
              background: 'var(--bg-2)',
              borderRadius: 'var(--radius)',
              padding: '3px',
              marginBottom: 'var(--space-4)',
            }}>
              {['email', 'sms'].map(ch => (
                <button
                  key={ch}
                  onClick={() => { setChannel(ch); setIdentifier(''); setError(''); }}
                  style={{
                    flex: 1,
                    height: 36,
                    border: 'none',
                    borderRadius: 'calc(var(--radius) - 2px)',
                    background: channel === ch ? 'var(--bg)' : 'transparent',
                    color: channel === ch ? 'var(--text)' : 'var(--text-2)',
                    fontWeight: 600,
                    fontSize: 'var(--text-sm)',
                    cursor: 'pointer',
                    boxShadow: channel === ch ? 'var(--shadow-sm)' : 'none',
                    transition: 'all 0.15s ease',
                    fontFamily: 'var(--font-sans)',
                    textTransform: 'capitalize',
                  }}
                >
                  {ch === 'sms' ? 'Phone' : 'Email'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSendOtp}>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label className="field-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                  {channel === 'email' ? 'Email address' : 'Phone number'}
                </label>
                <input
                  ref={inputRef}
                  className={`input${error ? ' input-error' : ''}`}
                  type={channel === 'email' ? 'email' : 'tel'}
                  inputMode={channel === 'sms' ? 'tel' : 'email'}
                  placeholder={channel === 'email' ? 'you@example.com' : '+2348012345678'}
                  value={identifier}
                  onChange={e => { setIdentifier(e.target.value); setError(''); }}
                  autoComplete={channel === 'email' ? 'email' : 'tel'}
                  disabled={loading}
                />
                {error && (
                  <p style={{ color: 'var(--red)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
                    {error}
                  </p>
                )}
              </div>
              <Button variant="primary" size="lg" style={{ width: '100%' }} disabled={loading || !identifier}>
                {loading ? 'Sending…' : 'Send code'}
              </Button>
            </form>
          </>
        )}

        {step === 'otp' && (
          <>
            <button
              onClick={() => { setStep('identifier'); setOtp(''); setError(''); }}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: 'var(--text-2)', fontSize: 'var(--text-sm)', cursor: 'pointer',
                marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--font-sans)',
              }}
            >
              ← Back
            </button>

            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              fontWeight: 600,
              marginBottom: 'var(--space-1)',
            }}>
              Enter verification code
            </h2>
            <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)' }}>
              Enter the 6-digit code sent to <strong style={{ color: 'var(--text)' }}>{identifier}</strong>
            </p>

            <form onSubmit={handleVerify}>
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <OTPInput value={otp} onChange={setOtp} error={otpError} disabled={loading} />
                {error && (
                  <p style={{
                    color: 'var(--red)', fontSize: 'var(--text-xs)',
                    marginTop: 'var(--space-2)', textAlign: 'center',
                  }}>
                    {error}
                  </p>
                )}
              </div>

              <Button
                variant="primary" size="lg"
                style={{ width: '100%' }}
                disabled={loading || otp.length < 6}
              >
                {loading ? 'Verifying…' : 'Verify code'}
              </Button>
            </form>

            {/* Resend */}
            <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
              {countdown > 0 ? (
                <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
                  Resend in {countdown}s
                </p>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={loading}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: 'var(--text-2)', fontSize: 'var(--text-sm)',
                    cursor: 'pointer', textDecoration: 'underline',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Resend code
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
