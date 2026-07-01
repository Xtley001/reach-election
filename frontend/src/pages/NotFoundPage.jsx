import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button.jsx';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)',
      background: 'var(--bg)', textAlign: 'center',
    }}>
      <p style={{ fontSize: 64, marginBottom: 'var(--space-4)' }}>404</p>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
        Page not found
      </h1>
      <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', maxWidth: 320 }}>
        The page you're looking for doesn't exist or you may not have access.
      </p>
      <Button variant="primary" onClick={() => navigate('/')}>Go home</Button>
    </div>
  );
}
