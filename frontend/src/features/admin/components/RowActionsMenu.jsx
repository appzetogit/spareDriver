import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

const MENU_WIDTH = 144;
const MENU_ITEM_HEIGHT = 40;
const MENU_PADDING = 8;
const VIEWPORT_GAP = 8;

/**
 * Row action menu rendered in a portal so it is not clipped by table overflow.
 */
const RowActionsMenu = ({ items = [], align = 'right' }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const menuHeight = items.length * MENU_ITEM_HEIGHT + MENU_PADDING;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + VIEWPORT_GAP;

    const top = openUp
      ? Math.max(VIEWPORT_GAP, rect.top - menuHeight - 4)
      : Math.min(window.innerHeight - menuHeight - VIEWPORT_GAP, rect.bottom + 4);

    const left =
      align === 'right'
        ? Math.min(
            window.innerWidth - MENU_WIDTH - VIEWPORT_GAP,
            Math.max(VIEWPORT_GAP, rect.right - MENU_WIDTH),
          )
        : align === 'center'
        ? Math.min(
            window.innerWidth - MENU_WIDTH - VIEWPORT_GAP,
            Math.max(VIEWPORT_GAP, rect.left + rect.width / 2 - MENU_WIDTH / 2),
          )
        : Math.min(
            window.innerWidth - MENU_WIDTH - VIEWPORT_GAP,
            Math.max(VIEWPORT_GAP, rect.left),
          );

    setPosition({ top, left });
  }, [align, menuHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onScrollOrResize = () => updatePosition();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e) => {
      const target = e.target;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);

    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, updatePosition]);

  const toggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((prev) => !prev);
  };

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        role="menu"
        aria-label="Row actions"
        className="fixed z-[9999] w-36 bg-white rounded-xl shadow-xl border border-slate-100 py-1 overflow-hidden"
        style={{ top: position.top, left: position.left }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isDanger = item.variant === 'danger';
          return (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick?.();
              }}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                isDanger
                  ? 'text-rose-600 hover:bg-rose-50'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {Icon && (
                <Icon
                  className={`w-4 h-4 ${isDanger ? 'text-rose-400' : 'text-slate-400'}`}
                />
              )}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>,
      document.body,
    );

  const justifyClass =
    align === 'center'
      ? 'justify-center'
      : align === 'left'
      ? 'justify-start'
      : 'justify-end';

  return (
    <div className={`relative flex ${justifyClass}`} data-row-action onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
        className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {menu}
    </div>
  );
};

export default RowActionsMenu;
