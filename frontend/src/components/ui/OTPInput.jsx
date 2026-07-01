import { useRef, useEffect } from 'react';

const LENGTH = 6;

/**
 * OTPInput — production-ready OTP component.
 * Features:
 *  - WebOTP API autofill (Android Chrome)
 *  - Paste handling (any cell)
 *  - Backspace navigation
 *  - aria-label on each cell
 *  - pattern="[0-9]*" for iOS numeric keyboard
 *  - Error shake animation via .otp-cell-error
 */
export function OTPInput({ value = '', onChange, error = false, disabled = false }) {
  const cells   = value.padEnd(LENGTH, '').slice(0, LENGTH).split('');
  const inputsRef = useRef([]);

  // WebOTP API (Android Chrome autofill)
  useEffect(() => {
    if (!('OTPCredential' in window)) return;
    const ac = new AbortController();
    navigator.credentials.get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then(cred => { if (cred?.code) onChange(cred.code); })
      .catch(() => {});
    return () => ac.abort();
  }, [onChange]);

  function handleChange(idx, e) {
    const digit = e.target.value.replace(/\D/g, '').slice(-1);
    const next  = cells.slice();
    next[idx]   = digit;
    onChange(next.join(''));
    if (digit && idx < LENGTH - 1) inputsRef.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx, e) {
    if (e.key === 'Backspace') {
      if (cells[idx]) {
        const next = cells.slice();
        next[idx] = '';
        onChange(next.join(''));
      } else if (idx > 0) {
        inputsRef.current[idx - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < LENGTH - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    onChange(pasted.padEnd(LENGTH, '').slice(0, LENGTH));
    const focusIdx = Math.min(pasted.length, LENGTH - 1);
    inputsRef.current[focusIdx]?.focus();
  }

  function handleFocus(e) {
    e.target.select();
  }

  return (
    <div className="otp-row" onPaste={handlePaste}>
      {cells.map((digit, idx) => (
        <input
          key={idx}
          ref={el => inputsRef.current[idx] = el}
          className={`otp-cell${error ? ' otp-cell-error' : ''}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`OTP digit ${idx + 1} of ${LENGTH}`}
          onChange={e => handleChange(idx, e)}
          onKeyDown={e => handleKeyDown(idx, e)}
          onFocus={handleFocus}
        />
      ))}
    </div>
  );
}
