export function Card({ elevated = false, children, className = '', style }) {
  return (
    <div className={`${elevated ? 'card-elevated' : 'card'} ${className}`} style={style}>
      {children}
    </div>
  );
}
