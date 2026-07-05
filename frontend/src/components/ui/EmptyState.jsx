import { Button } from './Button.jsx';

/** Shared empty-state: icon, title, hint, optional CTA. */
export function EmptyState({ icon = '📭', title, hint, ctaLabel, onCta }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-6)', color: 'var(--text-3)' }}>
      <p style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>{icon}</p>
      <p style={{ fontWeight: 600, color: 'var(--text-2)' }}>{title}</p>
      {hint && <p style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>{hint}</p>}
      {ctaLabel && onCta && (
        <Button variant="primary" size="sm" style={{ marginTop: 'var(--space-4)' }} onClick={onCta}>{ctaLabel}</Button>
      )}
    </div>
  );
}
