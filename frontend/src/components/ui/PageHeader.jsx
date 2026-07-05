/** Shared page header — title + optional subtitle + right-aligned actions slot.
 *  Used across director/coordinator screens so headers read as one system. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-5)',
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text)' }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}
