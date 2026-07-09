export function SectionCard({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 p-5 min-w-0 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-800 mb-4 tracking-wide">{title}</h3>
      <div className="space-y-3 min-w-0">{children}</div>
    </div>
  );
}

export function InfoItem({ label, value, capitalize = false, mono = false }) {
  const displayValue = value && value !== 'N/A' ? value : '—';

  return (
    <div className="group min-w-0">
      <p className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">{label}</p>
      <p
        className={`text-sm text-slate-700 break-words ${mono ? 'font-mono text-xs' : ''} ${capitalize ? 'capitalize' : ''} font-normal`}
      >
        {displayValue}
      </p>
    </div>
  );
}

export function InfoGrid({ items, columns = 2 }) {
  const colClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 3
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2';

  return (
    <div className={`grid ${colClass} gap-x-6 gap-y-5 min-w-0`}>
      {items.map((item, idx) => (
        <InfoItem key={idx} {...item} />
      ))}
    </div>
  );
}
