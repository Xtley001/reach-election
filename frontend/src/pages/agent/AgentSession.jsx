import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';

export default function AgentSession() {
  const [sessions, setSessions]    = useState([]);
  const [activeSession, setActive] = useState(null);
  const [queue, setQueue]          = useState([]);
  const [queueIndex, setIndex]     = useState(0);
  const [sending, setSending]      = useState(false);
  const [loading, setLoading]      = useState(true);

  useEffect(() => {
    api.getActiveSessions().then(data => {
      setSessions(data); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadQueue = useCallback(async (sessionId) => {
    const data = await api.getSessionQueue(sessionId);
    setActive({ id: sessionId, total: data.total, sent: data.sent });
    setQueue(data.queue);
    const saved = localStorage.getItem(`session_pos_${sessionId}`);
    setIndex(saved ? parseInt(saved, 10) : 0);
  }, []);

  const handleSent = async (channel) => {
    if (!queue[queueIndex]) return;
    const voter = queue[queueIndex];
    setSending(true);
    try {
      await api.logSend(activeSession.id, { voter_id: voter.voter_id, channel });
      const nextIndex = queueIndex + 1;
      setIndex(nextIndex);
      localStorage.setItem(`session_pos_${activeSession.id}`, nextIndex);
      setActive(p => ({ ...p, sent: p.sent + 1 }));
      if (nextIndex >= queue.length) {
        toast.success('Session complete! 🎉');
        localStorage.removeItem(`session_pos_${activeSession.id}`);
      }
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  };

  const handleSkip = () => {
    const next = queueIndex + 1;
    setIndex(next);
    localStorage.setItem(`session_pos_${activeSession.id}`, next);
  };

  const current  = queue[queueIndex];
  const progress = activeSession ? (activeSession.sent / (activeSession.total || 1)) * 100 : 0;

  if (loading) return <div className="spinner" style={{ margin: '80px auto' }} />;

  if (!activeSession) {
    if (sessions.length === 0) return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 'var(--text-2xl)', marginBottom: 16 }}>💬</p>
        <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
          No active sessions. Your coordinator will assign one when ready.
        </p>
      </div>
    );
    return (
      <div style={{ padding: '20px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 16 }}>Your Sessions</h2>
        {sessions.map(s => (
          <div key={s.id} className="card" style={{ marginBottom: 12, cursor: 'pointer' }}
               onClick={() => loadQueue(s.id)}>
            <p style={{ fontWeight: 600 }}>{s.template_label}</p>
            <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
              {s.voter_count} voters · {s.sent_count} sent
            </p>
          </div>
        ))}
      </div>
    );
  }

  if (queueIndex >= queue.length) return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Session Complete!</h2>
      <p style={{ color: 'var(--text-2)', marginTop: 8 }}>{activeSession.sent} voters reached</p>
      <button className="btn btn-outline btn-md" style={{ marginTop: 24 }}
              onClick={() => { setActive(null); setQueue([]); setIndex(0); }}>
        Back to Sessions
      </button>
    </div>
  );

  return (
    <div style={{ padding: '20px', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
            {queueIndex + 1} of {queue.length} · {activeSession.sent} sent
          </p>
          <button onClick={() => { setActive(null); setQueue([]); setIndex(0); }}
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Sessions
          </button>
        </div>
        <div className="progress-track">
          <div className="progress-fill progress-fill-green" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {current && (
        <div className="card-elevated" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 4 }}>{current.voter_name}</p>
          <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)', marginBottom: 16 }}>{current.polling_unit_name}</p>
          <div className="card-section">
            <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--text-2)',
                        fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>
              {current.resolved_message}
            </p>
          </div>
        </div>
      )}

      {current && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a href={current.whatsapp_link} className="btn btn-success btn-lg"
             style={{ textDecoration: 'none', justifyContent: 'center' }}
             onClick={() => setTimeout(() => handleSent('whatsapp'), 800)}>
            📲 Send via WhatsApp
          </a>
          <a href={current.sms_link} className="btn btn-outline btn-lg"
             style={{ textDecoration: 'none', justifyContent: 'center' }}
             onClick={() => setTimeout(() => handleSent('sms'), 800)}>
            💬 Send via SMS
          </a>
          <button className="btn btn-ghost btn-md" onClick={handleSkip} disabled={sending}>
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
