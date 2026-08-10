export default function QuickReplies({ items = [], onPick, disabled = false }) {
  if (!items.length || disabled) return null;

  return (
    <div className="px-3 py-2 border-t border-border-light bg-gray-50 shrink-0">
      <p className="text-[10px] uppercase tracking-wide text-text-muted font-semibold mb-1.5">
        Quick messages
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {items.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-text hover:bg-primary/10 hover:border-primary/40 transition"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
