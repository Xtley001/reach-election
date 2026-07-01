import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { DarkModeToggle } from '../components/ui/DarkModeToggle.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Badge } from '../components/ui/Badge.jsx';

export default function SettingsPage() {
  const { user, logout, reload } = useAuth();
  const [name, setName]         = useState(user?.name || '');
  const [saving, setSaving]     = useState(false);

  async function saveProfile() {
    if (!name.trim()) { toast.error('Name cannot be empty.'); return; }
    setSaving(true);
    try {
      await api.updateProfile({ name: name.trim() });
      toast.success('Profile updated.');
      await reload();
    } catch(e) { toast.error(e.message || 'Failed to update.'); }
    finally { setSaving(false); }
  }

  const roleLabels = { director: 'Campaign Director', coordinator: 'Coordinator', agent: 'Field Agent' };

  return (
    <div style={{ padding: 'var(--space-5)', maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>
        Settings
      </h1>

      {/* Profile */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Profile</p>
          <Badge variant="blue">{roleLabels[user?.role] || user?.role}</Badge>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Display name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name"
              onKeyDown={e => e.key === 'Enter' && saveProfile()} />
          </div>
          {user?.email && (
            <div>
              <label className="field-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Email</label>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', padding: '10px 0' }}>{user.email}</p>
            </div>
          )}
          {user?.phone && (
            <div>
              <label className="field-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Phone</label>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', padding: '10px 0' }}>{user.phone}</p>
            </div>
          )}
          <Button variant="primary" size="sm" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {/* Appearance */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>Appearance</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Dark mode</p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>Persisted across sessions</p>
          </div>
          <DarkModeToggle />
        </div>
      </div>

      {/* Sign out */}
      <div className="card">
        <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>Account</p>
        <Button variant="destructive" size="sm" onClick={() => logout().then(() => window.location.href = '/login')}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
