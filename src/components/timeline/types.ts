import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type TimelineItem<T> = {
  id: string;
  startDate: string; // ISO Y-M-D
  endDate: string; // ISO Y-M-D, inclusive
  data: T;
  render: (data: T) => ReactNode;
  color?: string;
  onClick?: () => void;
};

export type TimelineRow<T> = {
  id: string;
  label: string;
  icon?: LucideIcon;
  items: TimelineItem<T>[];
  collapsed?: boolean;
  height?: number; // px
};

export type TimelineDashboardProps<T> = {
  rows: TimelineRow<T>[];
  startDate: string;
  endDate: string;
  todayDate?: string;
  dayWidth?: number; // default 80
  onDayClick?: (date: string) => void;
  /** Extra content on the right of the month label (e.g. filter chips). */
  toolbarExtra?: ReactNode;
  className?: string;
  /** Scroll area height. */
  areaHeight?: string;
};
