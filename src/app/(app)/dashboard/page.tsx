/* ============================================
   LOWPASS — Dashboard Page

   TM overview: active tours, advance progress,
   notifications, and quick actions.

   This is the landing page after login.
   ============================================ */

import {
  Map,
  ClipboardCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// Placeholder data — will be replaced with real data from Supabase
const MOCK_TOURS = [
  {
    id: '1',
    artist: 'Good Neighbours',
    name: 'Global Festivals \'26',
    dates: '21 May - 14 Jun',
    shows: 6,
    advanceProgress: 67,
    status: 'active' as const,
  },
  {
    id: '2',
    artist: 'Good Neighbours',
    name: 'Summer College Shows',
    dates: '6 Apr - 19 Apr',
    shows: 4,
    advanceProgress: 25,
    status: 'planning' as const,
  },
];

const MOCK_FLAGS = [
  { id: '1', severity: 'critical', message: 'Missing hotel for San Francisco (23 May)', tour: 'Global Festivals \'26' },
  { id: '2', severity: 'high', message: 'Production advance incomplete — Bottlerock', tour: 'Global Festivals \'26' },
  { id: '3', severity: 'medium', message: 'Guitar tech flight not booked — College Shows', tour: 'Summer College Shows' },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-lp-text">Dashboard</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            Overview of your active tours and advance progress.
          </p>
        </div>
        <Link
          href="/tours/create"
          className="flex items-center gap-2 rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover transition-colors"
        >
          <Plus size={16} />
          New Tour
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Map}
          label="Active Tours"
          value="2"
          detail="1 planning, 1 active"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Shows Advanced"
          value="4 / 10"
          detail="40% complete"
          accentColor="text-emerald-500"
        />
        <StatCard
          icon={AlertTriangle}
          label="Open Flags"
          value="3"
          detail="1 critical"
          accentColor="text-amber-500"
        />
        <StatCard
          icon={Clock}
          label="Next Show"
          value="6 Apr"
          detail="Georgetown Uni, DC"
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tours — 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold text-lp-text">Active Tours</h2>
          <div className="space-y-3">
            {MOCK_TOURS.map((tour) => (
              <TourCard key={tour.id} tour={tour} />
            ))}
          </div>
        </div>

        {/* Flags — 1 column */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-lp-text">Flags & Alerts</h2>
          <div className="space-y-2">
            {MOCK_FLAGS.map((flag) => (
              <FlagItem key={flag.id} flag={flag} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


// ---- Sub-components ----

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  accentColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
  accentColor?: string;
}) {
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lp-bg-tertiary">
          <Icon size={20} className="text-lp-text-secondary" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">{label}</p>
          <p className={cn('text-xl font-bold', accentColor || 'text-lp-text')}>{value}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-lp-text-tertiary">{detail}</p>
    </div>
  );
}

function TourCard({ tour }: { tour: typeof MOCK_TOURS[0] }) {
  const statusColors = {
    planning: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    completed: 'bg-gray-500/10 text-gray-500',
  };

  return (
    <Link
      href={`/tours/${tour.id}`}
      className="group flex items-center justify-between rounded-xl border border-lp-border bg-lp-surface p-5 hover:border-lp-orange/30 hover:bg-lp-surface-hover transition-all"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-lp-text">{tour.artist}</h3>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusColors[tour.status])}>
            {tour.status}
          </span>
        </div>
        <p className="text-sm text-lp-text-secondary">{tour.name}</p>
        <div className="flex items-center gap-4 text-xs text-lp-text-tertiary">
          <span>{tour.dates}</span>
          <span>{tour.shows} shows</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Advance progress ring */}
        <div className="text-center">
          <div className="relative h-12 w-12">
            <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-lp-border" />
              <circle
                cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3"
                strokeDasharray={`${tour.advanceProgress * 1.257} 125.7`}
                strokeLinecap="round"
                className="text-lp-orange"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-lp-text">
              {tour.advanceProgress}%
            </span>
          </div>
          <p className="mt-1 text-[10px] text-lp-text-tertiary">Advanced</p>
        </div>

        <ArrowRight size={16} className="text-lp-text-tertiary group-hover:text-lp-orange transition-colors" />
      </div>
    </Link>
  );
}

function FlagItem({ flag }: { flag: typeof MOCK_FLAGS[0] }) {
  const severityColors = {
    critical: 'border-l-red-500 bg-red-500/5',
    high: 'border-l-amber-500 bg-amber-500/5',
    medium: 'border-l-blue-500 bg-blue-500/5',
    low: 'border-l-gray-400 bg-gray-400/5',
  };

  return (
    <div className={cn('rounded-lg border-l-4 p-3', severityColors[flag.severity as keyof typeof severityColors])}>
      <p className="text-sm text-lp-text">{flag.message}</p>
      <p className="mt-1 text-xs text-lp-text-tertiary">{flag.tour}</p>
    </div>
  );
}
