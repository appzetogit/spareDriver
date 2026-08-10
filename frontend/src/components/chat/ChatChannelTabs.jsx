export default function ChatChannelTabs({ tabs, activeChannel, onSelect, unreadByChannel = {} }) {
  if (!tabs?.length || tabs.length <= 1) return null;

  return (
    <div className="flex gap-1.5 px-3 py-2 border-b border-border-light bg-white shrink-0">
      {tabs.map((tab) => {
        const active = tab.channel === activeChannel;
        const unread = Number(unreadByChannel[tab.channel]) || 0;
        return (
          <button
            key={tab.channel}
            type="button"
            onClick={() => onSelect(tab.channel)}
            className={`relative flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition ${
              active
                ? 'bg-slate-900 text-white'
                : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
            }`}
          >
            {tab.label}
            {unread > 0 && (
              <span
                className={`absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center ${
                  active ? 'bg-danger text-white' : 'bg-danger text-white'
                }`}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
