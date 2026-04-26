'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { dayIndex, eachDayInclusive, toLocalYmd, ymdToMonthTitle } from './dates';
import { TimelineDayHeader } from './TimelineDayHeader';
import { TimelineMobileList } from './TimelineMobileList';
import { TimelineRowView, LABEL_W } from './TimelineRowView';
import { TimelineToolbar } from './TimelineToolbar';
import type { TimelineDashboardProps } from './types';

const BUFFER = 4;

function visibleRange(
  scrollLeft: number,
  clientWidth: number,
  dayWidth: number,
  totalDays: number
): { vs: number; ve: number } {
  if (totalDays === 0) return { vs: 0, ve: 0 };
  const start = Math.max(0, Math.floor(scrollLeft / dayWidth) - BUFFER);
  const end = Math.min(
    totalDays - 1,
    Math.ceil((scrollLeft + clientWidth) / dayWidth) + BUFFER
  );
  return { vs: start, ve: end };
}

export function TimelineDashboard<T>({
  rows,
  startDate,
  endDate,
  todayDate,
  dayWidth = 80,
  onDayClick,
  toolbarExtra,
  className,
  areaHeight = 'min(65vh, 560px)',
}: TimelineDashboardProps<T>) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [vs, setVs] = useState(0);
  const [ve, setVe] = useState(0);
  const [hScroll, setHScroll] = useState(0);
  const [showJump, setShowJump] = useState(false);

  const days = useMemo(
    () => eachDayInclusive(startDate, endDate),
    [startDate, endDate]
  );
  const dayToIndex = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d, i));
    return m;
  }, [days]);

  const todayYmd = todayDate ?? toLocalYmd(new Date());
  const todayIndex = useMemo(
    () => (todayYmd ? dayIndex(days, todayYmd) : -1),
    [days, todayYmd]
  );

  const totalW = days.length * dayWidth;

  const syncRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHScroll(el.scrollLeft);
    const { vs: a, ve: b } = visibleRange(
      el.scrollLeft,
      el.clientWidth,
      dayWidth,
      days.length
    );
    setVs(a);
    setVe(b);
  }, [dayWidth, days.length]);

  const onScroll = useCallback(() => {
    syncRange();
  }, [syncRange]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || todayIndex < 0) return;
    const pad = 8;
    el.scrollLeft = Math.max(0, todayIndex * dayWidth - pad);
    syncRange();
  }, [todayIndex, dayWidth, days.length, startDate, endDate, syncRange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || todayIndex < 0) return;
    const check = () => {
      const { vs: a, ve: b } = visibleRange(
        el.scrollLeft,
        el.clientWidth,
        dayWidth,
        days.length
      );
      setShowJump(todayIndex < a || todayIndex > b);
    };
    check();
    el.addEventListener('scroll', check);
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [todayIndex, dayWidth, days.length]);

  const monthLabel = useMemo(() => {
    if (days.length === 0) return '';
    const i = Math.min(
      days.length - 1,
      Math.max(0, Math.floor(hScroll / dayWidth))
    );
    return ymdToMonthTitle(days[i]!);
  }, [days, dayWidth, hScroll]);

  const jumpToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el || todayIndex < 0) return;
    el.scrollTo({ left: Math.max(0, todayIndex * dayWidth - 8), behavior: 'smooth' });
  }, [todayIndex, dayWidth]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      const step = e.shiftKey ? 7 * dayWidth : dayWidth;
      if (e.key === 'Home') {
        e.preventDefault();
        if (todayIndex >= 0) {
          el.scrollTo({ left: Math.max(0, todayIndex * dayWidth - 8), behavior: 'smooth' });
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        el.scrollTo({ left: el.scrollLeft - step, behavior: 'smooth' });
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        el.scrollTo({ left: el.scrollLeft + step, behavior: 'smooth' });
      }
    },
    [dayWidth, todayIndex]
  );

  if (isMobile) {
    return (
      <div
        className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl', className)}
        style={{ border: '1px solid var(--lp-border)' }}
      >
        <TimelineToolbar
          monthLabel={days.length ? ymdToMonthTitle(days[0]!) : ''}
          showJumpToday={false}
          onJumpToday={() => undefined}
          extra={toolbarExtra}
        />
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ maxHeight: areaHeight, height: areaHeight }}
        >
          <TimelineMobileList
            rows={rows}
            days={days}
            todayYmd={todayYmd}
            onDayClick={onDayClick}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl', className)}
      style={{ border: '1px solid var(--lp-border)' }}
    >
      <TimelineToolbar
        monthLabel={monthLabel}
        showJumpToday={showJump}
        onJumpToday={jumpToday}
        extra={toolbarExtra}
      />
      <div
        ref={scrollRef}
        role="grid"
        tabIndex={0}
        aria-label="Tour timeline"
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-[color:var(--lp-orange)]"
        style={{ maxHeight: areaHeight, height: areaHeight }}
      >
        <div
          className="min-w-0"
          style={{ minWidth: LABEL_W + totalW, width: LABEL_W + totalW }}
        >
          <div className="flex" style={{ width: LABEL_W + totalW }}>
            <div
              className="sticky left-0 z-20 flex shrink-0 items-end border-b"
              style={{
                width: LABEL_W,
                minWidth: LABEL_W,
                minHeight: 52,
                background: 'var(--lp-surface)',
                borderColor: 'var(--lp-border-light)',
              }}
            />
            <div
              className="flex"
              style={{
                minWidth: totalW,
                width: totalW,
                borderBottom: '1px solid var(--lp-border-light)',
              }}
            >
              <div style={{ width: vs * dayWidth, flexShrink: 0 }} aria-hidden />
              <TimelineDayHeader
                days={days}
                vs={vs}
                ve={ve}
                dayWidth={dayWidth}
                todayYmd={todayYmd}
                onDayClick={onDayClick}
              />
              <div
                style={{ width: Math.max(0, (days.length - 1 - ve) * dayWidth), flexShrink: 0 }}
                aria-hidden
              />
            </div>
          </div>
          {rows.map((r) => (
            <TimelineRowView
              key={r.id}
              row={r}
              dayWidth={dayWidth}
              days={days}
              dayToIndex={dayToIndex}
              vs={vs}
              ve={ve}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
