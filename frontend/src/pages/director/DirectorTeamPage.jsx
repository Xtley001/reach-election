import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';

export default function DirectorTeamPage() {
  const [tree, setTree]       = useState([]);   // [{zone_id, zone_name, coordinator, agents, agent_count}]
  const [invites, setInvites] = useState({});   // zoneId -> [invite]
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.teamTree();
      const zones = data.zones || [];
      setTree(zones);
      // Pending coordinator invites per zone (unclaimed)
      const inviteMap = {};
      await Promise.all(zones.map(async z => {
        const list = await api.listZoneInvites(z.zone_id).catch(() => []);
        inviteMap[z.zone_id] = (list || []).filter(i => i.role === 'coordinator' && !i.claimed_at);
      }));
      setInvites(inviteMap);
    } catch (e) {
      toast.error('Failed to load team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function inviteCoord(zoneId) {
    setBusy(zoneId);
    try {
      await api.createCoordInvite(zoneId);
      toast.success('Coordinator invite sent.');
      await load();
    } catch (e) {
      toast.error(e.message || 'Could not send invite.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(u) {
    const suspend = u.status === 'active';
    setBusy(u.id);
    try {
      if (suspend) await api.suspendUser(u.id); else await api.reinstateUser(u.id);
      toast.success(suspend ? 'Coordinator suspended.' : 'Coordinator reinstated.');
      setTree(prev => prev.map(z => z.coordinator?.id === u.id
        ? { ...z, coordinator: { ...z.coordinator, status: suspend ? 'suspended' : 'active' } } : z));
    } catch (e) {
      toast.error('Could not update status.');
    } finally {
      setBusy(null);
    }
  }

  async function revoke(zoneId, id) {
    try {
      await api.revokeInvite(id);
      setInvites(prev => ({ ...prev, [zoneId]: (prev[zoneId] || []).filter(i => i.id !== id) }));
      toast.success('Invite revoked.');
    } catch (e) { toast.error('Could not revoke invite.'); }
  }

  const totalCoords = tree.filter(z => z.coordinator).length;
  const totalAgents = tree.reduce((n, z) => n + (z.agent_count || 0), 0);

  return (
    <div style={{ padding: 'var(--space-5)' }}>
      <PageHeader
        title="Team"
        subtitle={`${totalCoords} coordinator${totalCoords !== 1 ? 's' : ''} · ${totalAgents} agent${totalAgents !== 1 ? 's' : ''} across ${tree.length} zone${tree.length !== 1 ? 's' : ''}`}
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}><div className="spinner" /></div>
      ) : tree.length === 0 ? (
        <EmptyState icon="🗺️" title="No zones yet" hint="Create zones in Territory first, then invite coordinators to run them." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {tree.map(z => {
            const coord = z.coordinator;
            const zoneAgents = z.agents || [];
            const pending = invites[z.zone_id] || [];
            return (
              <div key={z.zone_id} className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text)' }}>{z.zone_name}</p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{zoneAgents.length} agent{zoneAgents.length !== 1 ? 's' : ''}</p>
                  </div>
                  {!coord && pending.length === 0 && (
                    <Button variant="primary" size="sm" disabled={busy === z.zone_id} onClick={() => inviteCoord(z.zone_id)}>
                      {busy === z.zone_id ? 'Inviting…' : '+ Invite coordinator'}
                    </Button>
                  )}
                </div>

                {coord ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--bg-2)', borderRadius: 'var(--radius)' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 600, color: 'var(--text)' }}>{coord.name || coord.email}</p>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>Coordinator · {coord.email || coord.phone}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Badge variant={coord.status === 'active' ? 'green' : 'red'}>{coord.status === 'active' ? 'Active' : 'Suspended'}</Badge>
                      <Button variant="ghost" size="sm" disabled={busy === coord.id} onClick={() => toggleStatus(coord)}>
                        {coord.status === 'active' ? 'Suspend' : 'Reinstate'}
                      </Button>
                    </div>
                  </div>
                ) : pending.map(i => (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--bg-2)', borderRadius: 'var(--radius)' }}>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Invite pending{i.invited_email ? ` · ${i.invited_email}` : ''}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Badge variant="grey">Pending</Badge>
                      <Button variant="ghost" size="sm" onClick={() => revoke(z.zone_id, i.id)}>Revoke</Button>
                    </div>
                  </div>
                ))}

                {coord == null && pending.length === 0 && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>No coordinator assigned yet.</p>
                )}

                {/* Agents in this zone with voter counts (from team-tree) */}
                {zoneAgents.length > 0 && (
                  <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {zoneAgents.map(a => (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', padding: '6px var(--space-1)' }}>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || 'Unnamed agent'}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{a.voters_logged} voters</span>
                          {a.is_inactive_flag && <Badge variant="amber">Inactive</Badge>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
