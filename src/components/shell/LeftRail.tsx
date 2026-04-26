'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, Filter, List, PanelLeft, Pin } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Day type → colour token (left strip). */
export type ShellDayType =
  | 'show'
  | 'off'
  | 'travel'
  | 'rehearsal'
  | 'press'
  | 'radio'
  | 'tv'
  | 'festival';

const DAY_STRIP: Record<ShellDayType, string> = {
  show: 'var(--color-lp-day-show)',
  off: 'var(--color-lp-day-off)',
  travel: 'var(--color-lp-day-travel)',
  rehearsal: 'var(--color-lp-day-rehearsal)',
  press: 'var(--color-lp-day-press)',
  radio: 'var(--color-lp-day-radio)',
  tv: 'var(--color-lp-day-tv)',
  festival: 'var(--color-lp-day-festival)',
};

export type ListFilterDef =
  | {
      id: string;
      type: 'text';
      label: string;
      value: string;
      onChange: (v: string) => void;
    }
  | {
      id: string;
      type: 'select';
      label: string;
      value: string;
      options: Array<{ value: string; label: string }>;
      onChange: (v: string) => void;
    }
  | {
      id: string;
      type: 'dateRange';
      label: string;
      from: string;
      to: string;
      onChange: (from: string, to: string) => void;
    }
  | {
      id: string;
      type: 'multiSelect';
      label: string;
      value: string[];
      options: Array<{ value: string; label: string }>;
      onChange: (v: string[]) => void;
    };

export type LeftRailVariant =
  | { kind: 'spreadsheet'; sections: Array<{ id: string; label: string; href: string }>; activeId: string }
  | {
      kind: 'docDays';
      days: Array<{ date: string; label: string; type?: ShellDayType }>;
      activeDate: string;
      tourStartDate: string;
      tourEndDate: string;
      onDayClick?: (date: string) => void;
    }
  | { kind: 'docSections'; sections: Array<{ id: string; label: string; href: string }>; activeId: string }
  | {
      kind: 'list';
      filters: ListFilterDef[];
      savedViews?: Array<{ id: string; name: string }>;
      onSavedViewSelect?: (id: string) => void;
    }
  | { kind: 'dashboard'; tourId: string; structure: Array<{ label: string; href: string; icon: LucideIcon }> }
  | { kind: 'none' };

export type LeftRailProps = {
  variant: LeftRailVariant;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

function localYmd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function parseYmd(s: string): Date {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

function eachDayInRange(start: string, end: string): string[] {
  const a = parseYmd(start);
  const b = parseYmd(end);
  const out: string[] = [];
  const cur = new Date(a);
  while (cur <= b) {
    out.push(localYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function dayMeta(
  date: string,
  sparse: Array<{ date: string; label: string; type?: ShellDayType }>,
): { label: string; type?: ShellDayType } {
  const hit = sparse.find((d) => d.date === date);
  return { label: hit?.label ?? '', type: hit?.type };
}

function useMedia(minWidth: number): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const fn = () => setOk(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [minWidth]);
  return ok;
}

function CollapsedIconTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative flex justify-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className="pointer-events-none absolute left-full top-1/2 z-[1000] ml-2 -translate-y-1/2 rounded border px-2 py-1 text-xs font-medium whitespace-nowrap"
          style={{
            zIndex: 'var(--lp-z-tooltip)',
            background: 'var(--lp-surface)',
            color: 'var(--lp-text)',
            borderColor: 'var(--lp-border)',
            boxShadow: 'var(--lp-shadow-md)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

function SpreadsheetBody({
  sections,
  activeId,
  collapsed,
}: {
  sections: Array<{ id: string; label: string; href: string }>;
  activeId: string;
  collapsed: boolean;
}) {
  if (sections.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center p-4 text-center text-sm"
        style={{ color: 'var(--lp-text-tertiary)' }}
      >
        No sections yet
      </div>
    );
  }
  if (collapsed) {
    return (
      <nav className="flex flex-1 flex-col items-center gap-1 py-2" aria-label="Sections">
        {sections.map((s) => {
          const active = s.id === activeId;
          return (
            <CollapsedIconTooltip key={s.id} label={s.label}>
              <Link
                href={s.href}
                className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold"
                style={{
                  color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                  background: active ? 'var(--lp-surface)' : 'transparent',
                }}
                aria-current={active ? 'page' : undefined}
              >
                {s.label.slice(0, 1).toUpperCase()}
              </Link>
            </CollapsedIconTooltip>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="flex flex-1 flex-col py-2" aria-label="Sections">
      {sections.map((s) => {
        const active = s.id === activeId;
        return (
          <Link
            key={s.id}
            href={s.href}
            className="block min-w-0 pl-1 text-sm font-medium"
            style={{
              padding: 'var(--lp-space-3) var(--lp-space-4)',
              fontSize: 'var(--lp-text-base)',
              fontWeight: 500,
              color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
              background: active ? 'var(--lp-surface)' : 'transparent',
              borderLeftColor: active ? 'var(--color-lp-orange)' : 'transparent',
              borderLeftWidth: 3,
              borderLeftStyle: 'solid',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = 'var(--lp-surface-hover)';
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
            aria-current={active ? 'page' : undefined}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

function DocDaysBody({
  variant,
  collapsed,
  activeRef,
}: {
  variant: Extract<LeftRailVariant, { kind: 'docDays' }>;
  collapsed: boolean;
  activeRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const allDates = eachDayInRange(variant.tourStartDate, variant.tourEndDate);
  const today = localYmd(new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showJumpToday, setShowJumpToday] = useState(false);
  const todayRowRef = useRef<HTMLButtonElement | null>(null);
  const lastTodayVisibleRef = useRef(true);

  useLayoutEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [activeRef, variant.activeDate, collapsed]);

  useEffect(() => {
    const el = todayRowRef.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        const vis = e.isIntersecting;
        if (vis !== lastTodayVisibleRef.current) {
          lastTodayVisibleRef.current = vis;
          setShowJumpToday(!vis);
        }
      },
      { root, rootMargin: '0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [today, variant.tourStartDate, variant.tourEndDate, collapsed]);

  const goDay = (date: string) => {
    variant.onDayClick?.(date);
  };

  if (allDates.length === 0) {
    return (
      <div className="p-3 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
        No days in range
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2" ref={scrollRef}>
        {allDates.map((date) => {
          const m = dayMeta(date, variant.days);
          const t = m.type;
          const active = date === variant.activeDate;
          return (
            <CollapsedIconTooltip key={date} label={`${date} ${m.label}`.trim()}>
              <button
                type="button"
                className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded text-xs font-medium"
                style={{
                  color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                  background: date === today ? 'var(--color-lp-orange-subtle)' : active ? 'var(--lp-surface)' : 'transparent',
                }}
                onClick={() => goDay(date)}
                ref={date === variant.activeDate ? activeRef : undefined}
              >
                {t && (
                  <span
                    className="absolute top-0 left-0 h-full w-1"
                    style={{ background: t ? DAY_STRIP[t] : 'transparent' }}
                    aria-hidden
                  />
                )}
                {date.slice(8, 10)}
              </button>
            </CollapsedIconTooltip>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showJumpToday && (
        <div
          className="sticky top-0 z-10 border-b p-1"
          style={{ background: 'var(--lp-bg-secondary)', borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => {
              todayRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }}
            className="flex w-full items-center justify-center gap-1 rounded py-1 text-xs font-semibold"
            style={{
              color: 'var(--color-lp-orange)',
              background: 'var(--lp-surface)',
            }}
          >
            <Pin className="h-3 w-3" />
            Today
          </button>
        </div>
      )}
      <div
        className="custom-scrollbar min-h-0 flex-1 overflow-y-auto"
        ref={scrollRef}
        style={{ scrollbarWidth: 'thin' }}
      >
        {allDates.map((date) => {
          const m = dayMeta(date, variant.days);
          const t = m.type;
          const active = date === variant.activeDate;
          const isToday = date === today;
          const d = parseYmd(date);
          const dow = d.toLocaleDateString(undefined, { weekday: 'short' });
          return (
            <button
              key={date}
              type="button"
              ref={(el) => {
                if (date === variant.activeDate) {
                  (activeRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
                }
                if (isToday) {
                  (todayRowRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
                }
              }}
              onClick={() => goDay(date)}
              className="flex w-full min-w-0 items-stretch text-left"
              style={{
                minHeight: 'var(--lp-row-comfortable)',
                background: isToday
                  ? 'var(--color-lp-orange-subtle)'
                  : active
                    ? 'var(--lp-surface)'
                    : 'transparent',
                borderLeft: active ? '3px solid var(--color-lp-orange)' : '3px solid transparent',
              }}
            >
              <span
                className="w-1 shrink-0"
                style={{ background: t ? DAY_STRIP[t] : 'transparent' }}
                aria-hidden
              />
              <div className="min-w-0 flex-1 px-2 py-1">
                {isToday && (
                  <div
                    className="text-[10px] font-bold"
                    style={{
                      color: 'var(--color-lp-orange)',
                      letterSpacing: 'var(--lp-tracking-caps)',
                    }}
                  >
                    TODAY
                  </div>
                )}
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: 'var(--lp-text)', fontSize: 'var(--lp-text-sm)' }}
                  >
                    {date.slice(8, 10)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                    {dow}
                  </span>
                </div>
                {m.label ? (
                  <div className="truncate text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                    {m.label}
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListControls({ filters, savedViews, onSavedViewSelect }: { filters: ListFilterDef[]; savedViews?: Array<{ id: string; name: string }>; onSavedViewSelect?: (id: string) => void }) {
  if (filters.length === 0 && (!savedViews || savedViews.length === 0)) {
    return (
      <div className="p-3 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
        No filters
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-2">
      <div className="space-y-2">
        {filters.map((f) => {
          if (f.type === 'text') {
            return (
              <label key={f.id} className="block">
                <span className="mb-0.5 block text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                  {f.label}
                </span>
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)', background: 'var(--lp-bg)' }}
                />
              </label>
            );
          }
          if (f.type === 'select') {
            return (
              <label key={f.id} className="block">
                <span className="mb-0.5 block text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                  {f.label}
                </span>
                <select
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)', background: 'var(--lp-bg)' }}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          if (f.type === 'dateRange') {
            return (
              <div key={f.id} className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                  {f.label}
                </span>
                <div className="flex gap-1">
                  <input
                    type="date"
                    value={f.from}
                    onChange={(e) => f.onChange(e.target.value, f.to)}
                    className="min-w-0 flex-1 rounded border px-1 py-1 text-xs"
                    style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
                  />
                  <input
                    type="date"
                    value={f.to}
                    onChange={(e) => f.onChange(f.from, e.target.value)}
                    className="min-w-0 flex-1 rounded border px-1 py-1 text-xs"
                    style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
                  />
                </div>
              </div>
            );
          }
          return (
            <div key={f.id}>
              <span className="mb-0.5 block text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                {f.label}
              </span>
              <div className="max-h-28 space-y-0.5 overflow-y-auto rounded border p-1" style={{ borderColor: 'var(--lp-border)' }}>
                {f.options.map((o) => {
                  const on = f.value.includes(o.value);
                  return (
                    <label key={o.value} className="flex cursor-pointer items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          if (on) f.onChange(f.value.filter((v) => v !== o.value));
                          else f.onChange([...f.value, o.value]);
                        }}
                        className="lp-checkbox"
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {savedViews && savedViews.length > 0 && (
        <div className="border-t pt-2" style={{ borderColor: 'var(--lp-border)' }}>
          <div
            className="mb-1 px-1 text-xs font-semibold uppercase"
            style={{ color: 'var(--lp-text-tertiary)', letterSpacing: 'var(--lp-tracking-caps)' }}
          >
            Saved views
          </div>
          {savedViews.map((v) => (
            <button
              key={v.id}
              type="button"
              className="w-full rounded px-2 py-1.5 text-left text-sm"
              style={{ color: 'var(--lp-text)' }}
              onClick={() => onSavedViewSelect?.(v.id)}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardList({
  structure,
  collapsed,
}: {
  structure: Array<{ label: string; href: string; icon: LucideIcon }>;
  collapsed: boolean;
}) {
  const pathname = usePathname() ?? '';
  if (structure.length === 0) {
    return (
      <div className="p-3 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
        No links
      </div>
    );
  }
  if (collapsed) {
    return (
      <nav className="flex flex-col items-center gap-1 py-2" aria-label="Tour">
        {structure.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <CollapsedIconTooltip key={item.href} label={item.label}>
              <Link
                href={item.href}
                className="flex h-8 w-8 items-center justify-center rounded-md"
                style={{
                  color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
                  background: active ? 'var(--lp-surface)' : 'transparent',
                }}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" />
              </Link>
            </CollapsedIconTooltip>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="flex flex-col py-2" aria-label="Tour">
      {structure.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm"
            style={{
              color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
              background: active ? 'var(--lp-surface)' : 'transparent',
              fontWeight: active ? 600 : 500,
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = 'var(--lp-surface-hover)';
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)' }} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function LeftRail({ variant, collapsed: controlledCollapsed, onCollapsedChange }: LeftRailProps) {
  const isDesktop768 = useMedia(768);
  const wide1280 = useMedia(1280);
  const [internalCollapsed, setInternalCollapsed] = useState(false);

  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const setCollapsed = useCallback(
    (v: boolean) => {
      onCollapsedChange?.(v);
      if (controlledCollapsed === undefined) setInternalCollapsed(v);
    },
    [onCollapsedChange, controlledCollapsed],
  );

  useEffect(() => {
    if (controlledCollapsed !== undefined) return;
    const t = setTimeout(() => {
      setInternalCollapsed(!wide1280);
    }, 0);
    return () => clearTimeout(t);
  }, [wide1280, controlledCollapsed]);

  const activeRef = useRef<HTMLButtonElement | null>(null);

  if (variant.kind === 'none' || !isDesktop768) {
    return null;
  }

  const width = collapsed ? 'var(--lp-rail-collapsed)' : 'var(--lp-rail-width)';

  return (
    <aside
      className="lp-shell-left-rail min-h-0 flex-col border-r"
      style={{
        display: 'flex',
        width,
        minWidth: width,
        maxWidth: width,
        background: 'var(--lp-bg-secondary)',
        borderColor: 'var(--lp-border)',
        height: 'calc(100vh - var(--lp-topbar-height))',
        position: 'sticky',
        top: 'var(--lp-topbar-height)',
        zIndex: 'var(--lp-z-sticky)',
        transition: `width var(--lp-duration-slow) var(--lp-ease-standard)`,
      }}
    >
      <div
        className="flex items-center justify-end border-b p-1"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="btn-transition flex h-7 w-7 items-center justify-center rounded"
          style={{ color: 'var(--lp-text-secondary)' }}
          aria-label={collapsed ? 'Expand rail' : 'Collapse rail'}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {variant.kind === 'spreadsheet' && (
        <SpreadsheetBody sections={variant.sections} activeId={variant.activeId} collapsed={collapsed} />
      )}

      {variant.kind === 'docSections' && (
        <SpreadsheetBody sections={variant.sections} activeId={variant.activeId} collapsed={collapsed} />
      )}

      {variant.kind === 'docDays' && (
        <DocDaysBody variant={variant} collapsed={collapsed} activeRef={activeRef} />
      )}

      {variant.kind === 'list' && !collapsed && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex items-center gap-1 border-b px-2 py-1"
            style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)' }}
          >
            <Filter className="h-4 w-4" />
            <span className="text-xs font-medium">Filters</span>
          </div>
          <ListControls
            filters={variant.filters}
            savedViews={variant.savedViews}
            onSavedViewSelect={variant.onSavedViewSelect}
          />
        </div>
      )}

      {variant.kind === 'list' && collapsed && (
        <div className="flex flex-1 flex-col items-center py-2">
          <CollapsedIconTooltip label="Filters and saved views">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{ color: 'var(--lp-text-secondary)' }}
            >
              <List className="h-4 w-4" />
            </div>
          </CollapsedIconTooltip>
          {variant.savedViews && variant.savedViews.length > 0 && (
            <span className="mt-0.5 text-[10px] font-mono" style={{ color: 'var(--lp-text-tertiary)' }}>
              {variant.savedViews.length}
            </span>
          )}
        </div>
      )}

      {variant.kind === 'dashboard' && (
        <DashboardList structure={variant.structure} collapsed={collapsed} />
      )}
    </aside>
  );
}
