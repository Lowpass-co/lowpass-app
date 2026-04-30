/* ============================================
   LOWPASS — Phase 2 §B — Shared field-type icon

   Phase 2 unifies the field-type icon across AdvanceSectionBuilder
   (which had its own internal copy) and AdvanceShowReadView /
   ApplyAdvanceTemplateSlideOver (which previously rendered
   labels-only). One source of truth keeps the visual language
   consistent across edit + read + template-picker surfaces.
   ============================================ */

'use client';

import {
  AlignLeft,
  Banknote,
  Calendar,
  ChevronDown,
  Clock,
  Hash,
  Link as LinkIcon,
  Sliders,
  ToggleLeft,
  Type,
  Upload,
  User,
  type LucideIcon,
} from 'lucide-react';

const FIELD_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  select: ChevronDown,
  number: Hash,
  currency: Banknote,
  date: Calendar,
  time: Clock,
  boolean: ToggleLeft,
  file: Upload,
  contact: User,
  url: LinkIcon,
  slider: Sliders,
};

const FIELD_TYPE_LABEL: Record<string, string> = {
  text: 'Text',
  textarea: 'Long text',
  select: 'Dropdown',
  number: 'Number',
  currency: 'Currency',
  date: 'Date',
  time: 'Time',
  boolean: 'Yes/No',
  file: 'File',
  contact: 'Contact',
  url: 'URL',
  slider: 'Slider',
};

interface FieldTypeIconProps {
  type: string;
  /** Pixel size of the icon glyph. Default 13. */
  size?: number;
  /** Decorative-only (no tooltip / aria-label). Default false. */
  decorative?: boolean;
}

export function FieldTypeIcon({
  type,
  size = 13,
  decorative = false,
}: FieldTypeIconProps) {
  const Icon = FIELD_TYPE_ICON_MAP[type] ?? Hash;
  const label = FIELD_TYPE_LABEL[type] ?? type;
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border"
      style={{
        borderColor: 'var(--lp-border-subtle, var(--lp-border))',
        background: 'var(--lp-bg-deep, var(--lp-bg-secondary))',
        color: 'var(--lp-text-secondary)',
      }}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      title={decorative ? undefined : label}
    >
      <Icon size={size} />
    </span>
  );
}

/** True if the field value should render in JetBrains Mono (numerics,
 *  dates, times, currency, IDs). Used to apply the .lp-mono utility
 *  consistently across read + edit + template-picker surfaces. */
export function isMonoFieldType(type: string): boolean {
  return (
    type === 'number' ||
    type === 'currency' ||
    type === 'date' ||
    type === 'time' ||
    type === 'slider'
  );
}
