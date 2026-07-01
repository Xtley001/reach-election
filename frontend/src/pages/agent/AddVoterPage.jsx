import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { queueAction } from '../../lib/offline';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

const E164_RE = /^\+[1-9]\d{7,14}$/;

const SUPPORT_OPTIONS = [
  { v: 'strong_supporter', l: 'Strong Supporter', color: 'var(--green)' },
  { v: 'leaning',          l: 'Leaning',          color: 'var(--green)' },
  { v: 'undecided',        l: 'Undecided',        color: 'var(--yellow)' },
  { v: 'soft_opposition',  l: 'Against',          color: 'var(--red)' },
];

const PVC_OPTIONS = [
  { v: 'has_pvc', l: 'Has PVC' },
  { v: 'no_pvc',  l: 'No PVC'  },
  { v: 'unknown', l: 'Unknown' },
];

const GENDER_OPTIONS = [
  { v: 'male',   l: 'Male'   },
  { v: 'female', l: 'Female' },
  { v: 'other',  l: 'Other'  },
];

/* ── Tap-button row ────────────────────────────────────────────────────────── */
function TapRow({ options, value, onChange, columns = 2 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 'var(--space-2)',
    }}>
      {options.map(o => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          style={{
            padding: '10px var(--space-3)',
            borderRadius: 'var(--radius)',
            border: value === o.v
              ? `2px solid ${o.color || 'var(--accent)'}`
              : '2px solid var(--border)',
            background: value === o.v
              ? `color-mix(in srgb, ${o.color || 'var(--accent)'} 12%, transparent)`
              : 'var(--bg)',
            color: value === o.v ? (o.color || 'var(--accent)') : 'var(--text-2)',
            fontWeight: value === o.v ? 600 : 400,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            transition: 'all 0.1s ease',
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/* ── Search result card ────────────────────────────────────────────────────── */
function SearchResultCard({ voter, onSelect }) {
  const claimed = voter.is_claimed;
  return (
    <button
      type="button"
      disabled={claimed}
      onClick={() => !claimed && onSelect(voter)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        background: claimed ? 'var(--bg-2)' : 'var(--bg)',
        cursor: claimed ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        opacity: claimed ? 0.6 : 1,
        transition: 'border-color 0.12s',
      }}
      onMouseEnter={e => { if (!claimed) e.currentTarget.style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--text)', marginBottom: 2 }}>
          {voter.name}
        </p>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {voter.polling_unit_name}
          {voter.zone_name ? ` · ${voter.zone_name}` : ''}
          {voter.gender ? ` · ${voter.gender}` : ''}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {voter.is_seeded && (
          <span style={{
            fontSize: 'var(--text-xs)', fontWeight: 600, padding: '2px 6px',
            borderRadius: 999, background: 'color-mix(in srgb, var(--green) 15%, transparent)',
            color: 'var(--green)', whiteSpace: 'nowrap',
          }}>
            INEC ✓
          </span>
        )}
        {claimed
          ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>Tracked</span>
          : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>Confirm →</span>
        }
      </div>
    </button>
  );
}

/* ── Field wrapper ─────────────────────────────────────────────────────────── */
function F({ label, error, required, children }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-2)' }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && <p style={{ color: 'var(--red)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{error}</p>}
    </div>
  );
}

/* ── Claim form (for a selected seeded voter) ──────────────────────────────── */
function ClaimForm({ voter, onBack, onDone }) {
  const [phone, setPhone]       = useState('');
  const [support, setSupport]   = useState('unknown');
  const [pvc, setPvc]           = useState('unknown');
  const [gender, setGender]     = useState(voter.gender || '');
  const [loading, setLoading]   = useState(false);
  const [phoneErr, setPhoneErr] = useState('');
  const phoneRef = useRef(null);

  useEffect(() => {
    setTimeout(() => phoneRef.current?.focus(), 100);
  }, []);

  async function handleClaim() {
    setPhoneErr('');
    const ph = phone.trim();
    if (!ph) { setPhoneErr('Phone is required.'); return; }
    if (!E164_RE.test(ph)) { setPhoneErr('Use E.164 format: +2348012345678'); return; }
    if (support === 'unknown') { toast.error('Please select a support level.'); return; }

    setLoading(true);
    try {
      await api.claimVoter(voter.id, {
        phone: ph,
        support_level: support,
        pvc_status: pvc,
        gender: gender || undefined,
      });
      toast.success(`${voter.name} confirmed!`);
      onDone();
    } catch (err) {
      if (err.message?.includes('409')) {
        toast.error('This phone is already tracked by another agent.');
      } else {
        toast.error(err.message || 'Failed to confirm voter.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Pre-filled voter info */}
      <div style={{
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
          }}>
            {voter.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text)' }}>{voter.name}</p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>
              {voter.polling_unit_name} · INEC ✓
            </p>
          </div>
        </div>
      </div>

      {/* Phone */}
      <F label="Phone number" required error={phoneErr}>
        <Input
          ref={phoneRef}
          type="tel"
          inputMode="tel"
          placeholder="+2348012345678"
          value={phone}
          onChange={e => { setPhone(e.target.value); setPhoneErr(''); }}
          error={!!phoneErr}
        />
      </F>

      {/* Support level — big tap buttons, most important */}
      <F label="Support level" required>
        <TapRow options={SUPPORT_OPTIONS} value={support} onChange={setSupport} columns={2} />
      </F>

      {/* PVC status */}
      <F label="PVC status">
        <TapRow options={PVC_OPTIONS} value={pvc} onChange={setPvc} columns={3} />
      </F>

      {/* Gender — only if not already in INEC data */}
      {!voter.gender && (
        <F label="Gender">
          <TapRow options={GENDER_OPTIONS} value={gender} onChange={setGender} columns={3} />
        </F>
      )}

      <Button
        variant="primary"
        size="lg"
        onClick={handleClaim}
        disabled={loading}
        style={{ marginTop: 'var(--space-2)' }}
      >
        {loading ? 'Confirming…' : 'Confirm Voter'}
      </Button>
    </div>
  );
}

/* ── Manual add form (fallback) ────────────────────────────────────────────── */
function ManualForm({ initialName, onBack, onDone }) {
  const [name, setName]           = useState(initialName || '');
  const [phone, setPhone]         = useState('');
  const [puId, setPuId]           = useState('');
  const [support, setSupport]     = useState('unknown');
  const [pvc, setPvc]             = useState('unknown');
  const [gender, setGender]       = useState('');
  const [pus, setPUs]             = useState([]);
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState({});

  useEffect(() => {
    api.listPUs().then(setPUs).catch(() => {});
  }, []);

  function validate() {
    const e = {};
    if (!name.trim())  e.name  = 'Full name is required.';
    if (!phone.trim()) e.phone = 'Phone is required.';
    else if (!E164_RE.test(phone.trim())) e.phone = 'Use E.164: +2348012345678';
    if (!puId) e.puId = 'Select a polling unit.';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      polling_unit_id: puId,
      support_level: support,
      pvc_status: pvc,
      gender: gender || undefined,
    };
    try {
      if (!navigator.onLine) {
        await queueAction('add_voter', payload);
        toast.info('Saved offline — will sync when reconnected.');
        onDone();
        return;
      }
      await api.addVoter(payload);
      toast.success('Voter added!');
      onDone();
    } catch (err) {
      if (err.message?.includes('409')) toast.error('You already logged this voter.');
      else toast.error(err.message || 'Failed to add voter.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <F label="Full name" required error={errors.name}>
        <Input
          placeholder="e.g. Aisha Bello"
          value={name}
          onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
          error={!!errors.name}
          autoFocus
        />
      </F>

      <F label="Phone number" required error={errors.phone}>
        <Input
          type="tel"
          inputMode="tel"
          placeholder="+2348012345678"
          value={phone}
          onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: '' })); }}
          error={!!errors.phone}
        />
      </F>

      <F label="Polling unit" required error={errors.puId}>
        <select
          className={`input${errors.puId ? ' input-error' : ''}`}
          value={puId}
          onChange={e => { setPuId(e.target.value); setErrors(p => ({ ...p, puId: '' })); }}
        >
          <option value="">Select polling unit…</option>
          {pus.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </F>

      <F label="Support level" required>
        <TapRow options={SUPPORT_OPTIONS} value={support} onChange={setSupport} columns={2} />
      </F>

      <F label="PVC status">
        <TapRow options={PVC_OPTIONS} value={pvc} onChange={setPvc} columns={3} />
      </F>

      <F label="Gender">
        <TapRow options={GENDER_OPTIONS} value={gender} onChange={setGender} columns={3} />
      </F>

      <Button
        variant="primary"
        size="lg"
        onClick={handleSubmit}
        disabled={loading}
        style={{ marginTop: 'var(--space-2)' }}
      >
        {loading ? 'Saving…' : navigator.onLine ? 'Add Voter' : 'Save Offline'}
      </Button>
    </div>
  );
}

/* ── Main AddVoterPage ─────────────────────────────────────────────────────── */
export default function AddVoterPage() {
  const navigate = useNavigate();

  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [searched, setSearched]     = useState(false);
  const [selected, setSelected]     = useState(null);  // seeded voter chosen for claim
  const [mode, setMode]             = useState('search'); // 'search' | 'claim' | 'manual'

  const debounceRef = useRef(null);

  const runSearch = useCallback(async (q) => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    setSearching(true);
    try {
      const data = await api.searchVoters(q.trim());
      setResults(data.results || []);
      setSearched(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  function handleSelect(voter) {
    setSelected(voter);
    setMode('claim');
  }

  function handleManual() {
    setMode('manual');
  }

  function handleDone() {
    navigate('/agent/voters');
  }

  function handleBack() {
    setMode('search');
    setSelected(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 'var(--space-5)', maxWidth: 520, margin: '0 auto' }}>
      {/* Header with back arrow when in sub-form */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        {mode !== 'search' && (
          <button
            type="button"
            onClick={handleBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 20, lineHeight: 1, padding: 0 }}
            aria-label="Back"
          >
            ←
          </button>
        )}
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>
            {mode === 'claim'  ? 'Confirm Voter'  :
             mode === 'manual' ? 'Add New Voter'  : 'Add Voter'}
          </h1>
          {mode === 'search' && (
            <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)', marginTop: 2 }}>
              Search INEC register first — tap to confirm
            </p>
          )}
        </div>
      </div>

      {/* SEARCH MODE */}
      {mode === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Search input */}
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-3)', fontSize: 16, pointerEvents: 'none',
            }}>🔍</span>
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              placeholder="Type name to search…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Searching indicator */}
          {searching && (
            <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          )}

          {/* Results */}
          {!searching && results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {results.map(v => (
                <SearchResultCard key={v.id} voter={v} onSelect={handleSelect} />
              ))}
            </div>
          )}

          {/* No results message */}
          {!searching && searched && results.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: 'var(--space-6)',
              color: 'var(--text-3)',
              background: 'var(--bg-2)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border)',
            }}>
              <p style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-2)' }}>No match found</p>
              <p style={{ fontSize: 'var(--text-xs)' }}>Try a different spelling, or add manually below</p>
            </div>
          )}

          {/* Divider + manual add */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>not in register</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <Button variant="outline" size="md" onClick={handleManual} style={{ width: '100%' }}>
            + Add manually
          </Button>
        </div>
      )}

      {/* CLAIM MODE — selected seeded voter */}
      {mode === 'claim' && selected && (
        <ClaimForm voter={selected} onBack={handleBack} onDone={handleDone} />
      )}

      {/* MANUAL MODE */}
      {mode === 'manual' && (
        <ManualForm initialName={query} onBack={handleBack} onDone={handleDone} />
      )}
    </div>
  );
}
