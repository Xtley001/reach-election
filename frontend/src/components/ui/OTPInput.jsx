import { useRef, useEffect } from 'react';

const LENGTH = 6;

export function OTPInput({ value = '', onChange, error = false, disabled = false }) {
  const digits   = value.padEnd(LENGTH, '').slice(0, LENGTH).split('');
  const refs     = useRef([]);

  // WebOTP autofill (Android Chrome)
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

  const cellStyle = (idx) => ({
    display:       'inline-block',
    width:         44,
    height:        52,
    textAlign:     'center',
    fontSize:      22,
    fontWeight:    700,
    lineHeight:    '52px',
    fontFamily:    'monospace',
    background:    '#F5F5F7',
    border:        `2px solid ${error ? '#D92B2B' : digits[idx] ? '#1D1D1F' : '#D2D2D7'}`,
    borderRadius:  8,
    color:         '#1D1D1F',
    outline:       'none',
    cursor:        disabled ? 'not-allowed' : 'text',
    caretColor:    'transparent',
    MozAppearance: 'textfield',
    transition:    'border-color 0.15s',
  });

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
          style={cellStyle(idx)}
          onChange={e => handleChange(idx, e)}
          onKeyDown={e => handleKeyDown(idx, e)}
          onFocus={e => e.target.select()}
        />
      ))}
    </div>
  );
}
