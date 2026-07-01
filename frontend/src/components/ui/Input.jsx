export function Input({ error, className = '', ...props }) {
  return (
    <input
      className={`input ${error ? 'input-error' : ''} ${className}`}
      {...props}
    />
  );
}
