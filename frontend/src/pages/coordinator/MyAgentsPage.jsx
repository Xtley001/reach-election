import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { useAuth } from '../../hooks/useAuth.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { normalizePhone } from '../../lib/phone';

export default function MyAgentsPage() {
  const { user } = useAuth();
  const zoneId = user?.zone_id;
  const [agents, setAgents]   = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dash = await api.coordinatorDash();
      setAgents(dash.agent_stats || []);
      if (zoneId) {
        const inv = await api.listZoneInvites(zoneId).catch(() => []);
        setInvites((inv || []).filter(i => i.role === 'agent' && !i.claimed_at));
      }
    } catch (e) {
      toast.error('Failed to load your team.');
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => { load(); }, [load]);

  async function revoke(id) {
    try {
      await api.revokeInvite(id);
      setInvites(prev => prev.filter(i => i.id !== id));
      toast.success('Invite revoked.');
    } catch (e) {
      toast.error('Could not revoke invite.');
    }
  }

  return (
    <div style={{ padding: 'var(--space-5)' }}>
      <PageHeader
        title="My Agents"
        subtitle={`${agents.length} active · ${invites.length} pending invite${invites.length !== 1 ? 's' : ''}`}
        actions={<Button variant="primary" size="sm" onClick={() => setShowInvite(true)}>+ Invite agent</Button>}
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}><div className="spinner" /></div>
      ) : (
        <>
          {agents.length === 0 && invites.length === 0 ? (
            <EmptyState icon="👥" title="No agents yet" hint="Invite your first field agent to start logging voters."
                        ctaLabel="+ Invite agent" onCta={() => setShowInvite(true)} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {agents.map(a => (
                <div key={a.agent_id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600, color: 'var(--text)' }}>{a.agent_name || 'Unnamed agent'}</p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>
                      {a.voters_logged} voters · {a.messages_sent} msgs
                    </p>
                  </div>
                  <Badge variant={a.is_inactive_flag ? 'amber' : 'green'}>{a.is_inactive_flag ? 'Inactive' : 'Active'}</Badge>
                </div>
              ))}

              {invites.length > 0 && (
                <>
                  <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-2)', marginTop: 'var(--space-4)', marginBottom: 'var(--space-1)' }}>Pending invites</p>
                  {invites.map(i => (
                    <div key={i.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, color: 'var(--text)' }}>{i.invited_name}</p>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{i.invited_email}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <Badge variant="grey">Pending</Badge>
                        <Button variant="ghost" size="sm" onClick={() => revoke(i.id)}>Revoke</Button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      {showInvite && (
        <InviteAgentModal
          zoneId={zoneId}
          onClose={() => setShowInvite(false)}
          onDone={() => { setShowInvite(false); load(); }}
        />
      )}
    </div>
  );
}

function InviteAgentModal({ zoneId, onClose, onDone }) {
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { toast.error('Name and email are required.'); return; }
    setBusy(true);
    try {
      await api.createAgentInvite({ name: name.trim(), email: email.trim(), phone: normalizePhone(phone) || undefined, zone_id: zoneId });
      toast.success('Invite sent.');
      onDone();
    } catch (err) {
      toast.error(err.message || 'Could not send invite.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 420, padding: 'var(--space-5)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Invite agent</h2>
        <label className="field-label">Full name *</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aisha Bello" style={{ marginBottom: 'var(--space-3)' }} />
        <label className="field-label">Email *</label>
        <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" style={{ marginBottom: 'var(--space-3)' }} />
        <label className="field-label">Phone</label>
        <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+2348012345678" style={{ marginBottom: 'var(--space-5)' }} />
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</Button>
        </div>
      </form>
    </div>
  );
}
