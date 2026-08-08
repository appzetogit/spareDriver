export function SectionCard({ title, children, className = '', actions = null, status = null }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 p-5 min-w-0 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-800 tracking-wide">{title}</h3>
          {status}
        </div>
        {actions ? <div className="shrink-0 w-full sm:w-auto">{actions}</div> : null}
      </div>
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
