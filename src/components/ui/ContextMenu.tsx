'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ContextMenuItem = {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
};

export function ContextMenu({
  items,
  align = 'right',
  onBeforeOpen,
}: {
  items: ContextMenuItem[];
  align?: 'left' | 'right';
  onBeforeOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const width = 180;
      const left = align === 'right' ? rect.right - width : rect.left;
      setMenuRect({ top: rect.bottom + 4, left, width });
    } else setMenuRect(null);
  }, [open, align]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!open) onBeforeOpen?.();
          setOpen((o) => !o);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-lp-text-tertiary transition-colors hover:bg-lp-surface-hover hover:text-lp-text"
        aria-label="Options"
      >
        <MoreVertical size={18} />
      </button>
      {open &&
        menuRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="lp-dropdown-layer fixed min-w-[180px] overflow-hidden rounded-xl border border-lp-border bg-lp-surface py-1 shadow-xl animate-scale-in"
            style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
          >
            {items.map((item, i) => {
              const Icon = item.icon;
              const isDanger = item.variant === 'danger';
              return (
                <button
                  key={i}
                  type="button"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (item.disabled) return;
                    item.onClick();
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
                    isDanger
                      ? 'text-red-500 hover:bg-red-500/10 tour-card-delete-option'
                      : 'text-lp-text hover:bg-lp-surface-hover'
                  )}
                >
                  {Icon && <Icon size={14} className="shrink-0" />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
