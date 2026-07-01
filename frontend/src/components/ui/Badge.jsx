export function Badge({ variant = 'grey', children }) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
