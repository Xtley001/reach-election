import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import {
  contactStatusLabels, contactStatusVariant,
  pvcStatusLabels, pvcStatusVariant,
  supportLevelLabels, supportLevelVariant,
} from '../../lib/labels';

const STATUS_OPTS  = ['unreached','contacted','no_answer','confirmed_voter','pvc_issue','needs_follow_up','wrong_number','unreachable','declined'];
const PVC_OPTS     = ['has_pvc','no_pvc','unknown'];
const SUPPORT_OPTS = ['strong_supporter','leaning','undecided','soft_opposition','unknown'];

/**
 * Shared, role-agnostic voter browser. The backend GET /voters auto-scopes:
 * director → whole campaign, coordinator → own zone. So this one component
 * serves both the Director "Voters" and Coordinator "Zone Voters" screens.
 */
export default function VotersBrowser({ title, subtitle, showExport = false }) {
  const [voters, setVoters]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [search, setSearch]   = useState('');
  const [status, setStatus]   = useState('');
  const [pvc, setPvc]         = useState('');
  const [support, setSupport] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = { limit: 100, offset: 0 };
      if (search)  p.search = search;
      if (status)  p.status = status;
      if (pvc)     p.pvc_status = pvc;
      if (support) p.support_level = support;
      const data = await api.listVoters(p);
      setVoters(data.voters || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error('Failed to load voters.');
    } finally {
      setLoading(false);
    }
  }, [search, status, pvc, support]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.exportVoters();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'voters.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Export failed.');
    } finally {
      setExporting(false);
    }
  }

  const filtersActive = search || status || pvc || support;

  return (
    <div style={{ padding: 'var(--space-5)' }}>
      <PageHeader
        title={title}
        subtitle={`${total.toLocaleString()} voter${total !== 1 ? 's' : ''}${subtitle ? ' · ' + subtitle : ''}`}
        actions={showExport && (
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        )}
      />

      {/* Filters */}
      <div className="filter-bar" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1.4fr) repeat(3, minmax(0,1fr))',
        gap: 'var(--space-2)', marginBottom: 'var(--space-4)',
      }}>
        <input className="input" placeholder="Search name or phone…" value={search}
               onChange={e => setSearch(e.target.value)} style={{ height: 40 }} />
        <select className="input" style={{ height: 40 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{contactStatusLabels[s] || s}</option>)}
        </select>
        <select className="input" style={{ height: 40 }} value={pvc} onChange={e => setPvc(e.target.value)}>
          <option value="">All PVC</option>
          {PVC_OPTS.map(s => <option key={s} value={s}>{pvcStatusLabels[s] || s}</option>)}
        </select>
        <select className="input" style={{ height: 40 }} value={support} onChange={e => setSupport(e.target.value)}>
          <option value="">All support</option>
          {SUPPORT_OPTS.map(s => <option key={s} value={s}>{supportLevelLabels[s] || s}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}><div className="spinner" /></div>
      ) : voters.length === 0 ? (
        <EmptyState
          icon="🗳️"
          title={filtersActive ? 'No voters match these filters' : 'No voters yet'}
          hint={filtersActive ? 'Try clearing or adjusting the filters above.' : 'Voters logged by your agents will appear here.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {voters.map(v => (
            <div key={v.id} className="card" onClick={() => setSelected(v)}
                 style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: 'var(--text-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{v.phone || '—'}</p>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Badge variant={supportLevelVariant[v.support_level] || 'grey'}>{supportLevelLabels[v.support_level] || v.support_level}</Badge>
                <Badge variant={pvcStatusVariant[v.pvc_status] || 'grey'}>{pvcStatusLabels[v.pvc_status] || v.pvc_status}</Badge>
                <Badge variant={contactStatusVariant[v.current_status] || 'grey'}>{contactStatusLabels[v.current_status] || v.current_status}</Badge>
              </div>
            </div>
          ))}
          {total > voters.length && (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 'var(--text-sm)', padding: 'var(--space-4)' }}>
              Showing first {voters.length} of {total.toLocaleString()}. Use filters to narrow down.
            </p>
          )}
        </div>
      )}

      {selected && <VoterDetailModal id={selected.id} fallback={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function VoterDetailModal({ id, fallback, onClose }) {
  const [voter, setVoter] = useState(fallback);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.getVoter(id)
      .then(d => { if (!alive) return; setVoter(d); setContacts(d.contacts || []); })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="card modal-sheet" style={{
        width: '100%', maxWidth: 480, maxHeight: '82vh', overflowY: 'auto',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 'var(--space-5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 700 }}>{voter.name}</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', marginTop: 2 }}>{voter.phone || 'No phone on file'}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-3)', lineHeight: 1 }} aria-label="Close">×</button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          <Badge variant={supportLevelVariant[voter.support_level] || 'grey'}>{supportLevelLabels[voter.support_level] || voter.support_level}</Badge>
          <Badge variant={pvcStatusVariant[voter.pvc_status] || 'grey'}>{pvcStatusLabels[voter.pvc_status] || voter.pvc_status}</Badge>
          <Badge variant={contactStatusVariant[voter.current_status] || 'grey'}>{contactStatusLabels[voter.current_status] || voter.current_status}</Badge>
        </div>

        {voter.notes && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', background: 'var(--bg-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius)', marginBottom: 'var(--space-4)' }}>{voter.notes}</p>
        )}

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-2)', marginBottom: 'var(--space-2)' }}>Contact history</h3>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}><div className="spinner" /></div>
        ) : contacts.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>No contact attempts logged yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {contacts.map(c => (
              <div key={c.id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Badge variant={contactStatusVariant[c.status_set] || 'grey'}>{contactStatusLabels[c.status_set] || c.status_set}</Badge>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                {c.outcome_note && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', marginTop: 4 }}>{c.outcome_note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
