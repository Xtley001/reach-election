import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: 'var(--bg, #fff)',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 700, marginBottom: '0.5rem' }}>
        REACH Election
      </h1>
      <p style={{ fontSize: '1.125rem', color: 'var(--text-2, #555)', maxWidth: '480px', marginBottom: '2.5rem' }}>
        Voter mobilisation infrastructure for modern political campaigns.
        Manage your field teams, track outreach, and maximise turnout.
      </p>
      <button
        className="btn btn-primary"
        style={{ minWidth: '160px', fontSize: '1rem', padding: '0.75rem 2rem' }}
        onClick={() => navigate('/login')}
      >
        Sign in
      </button>
    </div>
  );
}
