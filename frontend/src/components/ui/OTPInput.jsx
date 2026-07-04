import { useRef, useEffect, useState } from 'react';

const LENGTH = 6;

// Read theme that theme-init.js stamped on <html> before React mounted.
// Falls back to OS preference. Re-evaluated on every render so theme toggles work.
function isDarkMode() {
  if (typeof window === 'undefined') return false;
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark')  return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function OTPInput({ value = '', onChange, error = false, disabled = false }) {
  const digits  = value.padEnd(LENGTH, '').slice(0, LENGTH).split('');
  const refs    = useRef([]);
  // Re-render when theme changes so colors update
  const [, tick] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const obs = new MutationObserver(() => tick(n => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    mq.addEventListener('change', () => tick(n => n + 1));
    return () => { obs.disconnect(); mq.removeEventListener('change', () => {}); };
  }, []);

  // WebOTP autofill (Android Chrome)
  useEffect(() => {
    if (!('OTPCredential' in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then(cred => { if (cred?.code) onChange(cred.code.replace(/\D/g, '').slice(0, LENGTH)); })
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
      } else { focus(idx - 1); }
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

  const dark = isDarkMode();

  // Hardcoded hex palette — same values as global.css tokens, no var() needed
  const C = dark ? {
    bg:      '#1C1C1E',
    text:    '#F5F5F7',
    idle:    '#38383A',
    filled:  '#F5F5F7',
    focus:   '#F5F5F7',
    error:   '#FF453A',
    shadow:  'rgba(255,255,255,0.10)',
  } : {
    bg:      '#F5F5F7',
    text:    '#1D1D1F',
    idle:    '#D2D2D7',
    filled:  '#1D1D1F',
    focus:   '#1D1D1F',
    error:   '#D92B2B',
    shadow:  'rgba(0,0,0,0.08)',
  };

  function borderHex(idx) {
    if (error)       return C.error;
    if (digits[idx]) return C.filled;
    return C.idle;
  }

  return (
    <div
      onPaste={handlePaste}
      style={{ display: 'flex', gap: 8, justifyContent: 'center', width: '100%' }}
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
            display:       'inline-block',
            width:         44,
            height:        52,
            textAlign:     'center',
            fontSize:      22,
            fontWeight:    700,
            lineHeight:    '52px',
            fontFamily:    'monospace',
            background:    C.bg,
            border:        `2px solid ${borderHex(idx)}`,
            borderRadius:  8,
            color:         C.text,
            outline:       'none',
            caretColor:    'transparent',
            cursor:        disabled ? 'not-allowed' : 'text',
            opacity:       disabled ? 0.5 : 1,
            transition:    'border-color 0.15s ease, box-shadow 0.15s ease',
            MozAppearance: 'textfield',
            flexShrink:    0,
          }}
          onChange={e => handleChange(idx, e)}
          onKeyDown={e => handleKeyDown(idx, e)}
          onFocus={e => {
            e.target.style.borderColor = C.focus;
            e.target.style.boxShadow   = `0 0 0 3px ${C.shadow}`;
            e.target.select();
          }}
          onBlur={e => {
            e.target.style.borderColor = borderHex(idx);
            e.target.style.boxShadow   = 'none';
          }}
        />
      ))}
    </div>
  );
}
