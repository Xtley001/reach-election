import { useTheme } from '../../hooks/useTheme.js';

/**
 * DarkModeToggle — persisted to localStorage as data-theme attribute.
 * Per 01_DESIGN_SYSTEM.md and Phase 8 requirement 8.10.
 */
export function DarkModeToggle({ size = 'md' }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Light mode' : 'Dark mode'}
      style={{
        width:  size === 'sm' ? 36 : 44,
        height: size === 'sm' ? 36 : 44,
        borderRadius: 'var(--radius)',
        border: '1.5px solid var(--border)',
        background: 'var(--bg-2)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size === 'sm' ? 16 : 20,
        transition: 'background 0.2s ease',
        color: 'var(--text)',
        flexShrink: 0,
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
