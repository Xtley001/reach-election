import { useState, useEffect } from 'react';
import { initToast } from '../../lib/toast';

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    initToast(({ type, message }) => {
      const id = Date.now();
      setToasts(p => [...p, { id, type, message }]);
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
    });
  }, []);

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'center',
    }}>
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} role="alert">
          {t.message}
        </div>
      ))}
    </div>
  );
}
