import { useRef, useEffect } from 'react';

const LENGTH = 6;

export function OTPInput({ value = '', onChange, error = false, disabled = false }) {
  const digits = value.padEnd(LENGTH, '').slice(0, LENGTH).split('');
  const refs   = useRef([]);

  useEffect(() => {
    if (!('OTPCredential' in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then(cred => { if (cred?.code) onChange(cred.code.slice(0, LENGTH)); })
      .catch(() => {});
    return () => ac.abort();
  }, [onChange]);

  function focus(idx) {
    refs.current[Math.max(0, Math.min(idx, LENGTH - 1))]?.focus();
  }

  function handleChange(idx, e) {
    const digit = e.target.value.replace(/\D/g, '').slice(-1);
    const next  = digits.slice();
    next[idx]   = digit;
    onChange(next.join('').trimEnd());
    if (digit && idx < LENGTH - 1) focus(idx + 1);
  }

  function handleKeyDown(idx, e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[idx]) {
        const next = digits.slice(); next[idx] = '';
        onChange(next.join('').trimEnd());
      } else {
        focus(idx - 1);
      }
    } else if (e.key === 'ArrowLeft')  { e.preventDefault(); focus(idx - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); focus(idx + 1); }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    onChange(pasted);
    focus(Math.min(pasted.length, LENGTH - 1));
  }

  // Resolve border color: use CSS var() strings so dark mode works automatically
  function borderColor(idx) {
    if (error)       return 'var(--red)';
    if (digits[idx]) return 'var(--accent)';
    return 'var(--border)';
  }

  return (
    <div
      onPaste={handlePaste}
      style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={el => refs.current[idx] = el}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${idx + 1} of ${LENGTH}`}
          style={{
            /* Explicit pixel size — never collapses regardless of flex context */
            flexShrink: 0,
            width:      '44px',
            height:     '52px',
            textAlign:  'center',
            fontSize:   '22px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            background: 'var(--bg-2)',
            border:     `2px solid ${borderColor(idx)}`,
            borderRadius: '8px',
            color:      'var(--text)',
            outline:    'none',
            caretColor: 'transparent',
            cursor:     disabled ? 'not-allowed' : 'text',
            opacity:    disabled ? 0.5 : 1,
            transition: 'border-color 0.15s ease',
            /* Suppress browser number input spinners */
            MozAppearance: 'textfield',
          }}
          onChange={e => handleChange(idx, e)}
          onKeyDown={e => handleKeyDown(idx, e)}
          onFocus={e => {
            e.target.style.borderColor = 'var(--accent)';
            e.target.style.boxShadow   = '0 0 0 3px rgba(0,0,0,0.08)';
            e.target.select();
          }}
          onBlur={e => {
            e.target.style.borderColor = borderColor(idx);
            e.target.style.boxShadow   = 'none';
          }}
        />
      ))}
    </div>
  );
}
