import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Badge } from '../../components/ui/Badge.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import TemplateManager from './TemplateManager.jsx';

const STATUS_VARIANT = { active: 'green', draft: 'grey', completed: 'blue', cancelled: 'red' };

export default function DirectorMessagingPage() {
  const [tab, setTab] = useState('sessions');

  return (
    <div style={{ padding: 'var(--space-5)' }}>
      <PageHeader title="Messaging" subtitle="Templates your agents send, and the sessions that dispatch them" />

      <div role="tablist" style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--border)' }}>
        {['sessions', 'templates'].map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            style={{
              padding: '10px var(--space-4)', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', textTransform: 'capitalize',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--text)' : 'var(--text-3)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}>{t}</button>
        ))}
      </div>

      {tab === 'sessions' ? <SessionsTab /> : <div style={{ margin: 'calc(var(--space-5) * -1)' }}><TemplateManager /></div>}
    </div>
  );
}

function SessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await api.listSessions() || []);
    } catch (e) {
      toast.error('Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}><div className="spinner" /></div>;
  if (sessions.length === 0) return (
    <EmptyState icon="💬" title="No messaging sessions yet"
                hint="Coordinators create sessions from a template and assign them to agents. They'll appear here with live progress." />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {sessions.map(s => {
        const pct = s.overall_pct || 0;
        const fill = pct >= 80 ? 'progress-fill-green' : pct >= 40 ? 'progress-fill-amber' : 'progress-fill-red';
        return (
          <div key={s.id} className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, color: 'var(--text)' }}>{s.template_label || 'Untitled session'}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>
                  {s.agent_count || 0} agent{(s.agent_count || 0) !== 1 ? 's' : ''} · {new Date(s.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[s.status] || 'grey'}>{s.status}</Badge>
            </div>
            <div className="progress-track"><div className={`progress-fill ${fill}`} style={{ width: `${pct}%` }} /></div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 6 }}>
              {s.sent_count || 0} / {s.voter_count || 0} sent · {pct}%
            </p>
          </div>
        );
      })}
    </div>
  );
}
